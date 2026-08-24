import type { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma';
import { runAutopilotTick } from './lib/autopilot';
import { claimJobTransition, transitionJob } from './lib/control-plane';
import { getCreativeDirector, type CreativePlan } from './lib/creative-director';
import { evaluateCreativeQuality } from './lib/creative-quality';
import { getOpenArtAccessToken } from './lib/openart-oauth';
import { getPublishingProvider, getVideoGenerationProvider } from './lib/providers';
import { evaluateRuntimeSafety, readinessSummary } from './lib/runtime-readiness';
import { createTelegramBot, notifyOperator } from './lib/telegram';
import { notifyJobFailureOnce, notifyReviewReady, sweepReadyReviewNotifications } from './lib/telegram-review';
import { syncPublishedAnalytics } from './lib/youtube-analytics';
import { generationWorkDecision } from './lib/generation-recovery';
import { effectiveVideoProvider, zeroCostMode } from './lib/zero-cost';

let stopping = false;
let lastAnalyticsSyncAt = 0;
let lastAutopilotTickAt = 0;
let lastHeartbeatAt = 0;

function autopilotExecutionBlocked(job: { origin: string; provider: string }) {
  const isAutopilot = job.origin === 'AUTOPILOT';
  const provider = effectiveVideoProvider(job.provider);
  const isFree = provider === 'mock' || provider === 'mock-demo' || provider === 'local-demo' || provider === 'local-ffmpeg';
  if (!isAutopilot || isFree) return false;
  return process.env.ALLOW_PAID_GENERATION !== 'true' || process.env.ALLOW_AUTOPILOT_PAID_GENERATION !== 'true';
}

async function prepareCreativePlan(job: { id: string; requestedDuration: number; creativeBrief: Prisma.JsonValue | null; prompt: { externalPromptId: string; category: string; concept: string; fullPrompt: string; channelType: 'GENERAL' | 'KIDS_CHANNEL_ONLY' } }) {
  if (job.creativeBrief) {
    console.info(`[JOB ${job.prompt.externalPromptId}] creative plan ready (reused)`);
    return job.creativeBrief as unknown as CreativePlan;
  }

  const director = getCreativeDirector();
  const result = await director.prepare({
    externalPromptId: job.prompt.externalPromptId,
    category: job.prompt.category,
    concept: job.prompt.concept,
    fullPrompt: job.prompt.fullPrompt,
    durationSeconds: job.requestedDuration,
    channelType: job.prompt.channelType
  });

  const quality = evaluateCreativeQuality(result.plan, {
    durationSeconds: job.requestedDuration,
    channelType: job.prompt.channelType
  });
  if (quality.blocking.length) {
    throw new Error(`Creative quality gate blocked rendering: ${quality.blocking.join('; ')}`);
  }

  await prisma.productionJob.update({
    where: { id: job.id },
    data: {
      creativeBrief: JSON.parse(JSON.stringify(result.plan)) as Prisma.InputJsonValue,
      creativeModel: result.model,
      creativePreparedAt: new Date(),
      title: result.plan.title,
      description: result.plan.description,
      hashtags: result.plan.hashtags
    }
  });
  await prisma.activityLog.create({
    data: {
      actor: 'creative-director',
      action: 'CREATIVE_PLAN_PREPARED',
      entityType: 'ProductionJob',
      entityId: job.id,
      metadata: {
        model: result.model,
        qualityScore: quality.score,
        qualityWarnings: quality.warnings,
        qualityBlocking: quality.blocking
      }
    }
  });
  console.info(`[JOB ${job.prompt.externalPromptId}] creative plan ready (${result.model})`);
  return result.plan;
}

function errorMessage(error: unknown, fallback: string) {
  return (error instanceof Error ? error.message : fallback).replace(/(?:sk-|gsk_|Bearer\s+)[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, 500);
}

function nextPollDate(seconds = 15) {
  return new Date(Date.now() + Math.max(5, Math.min(300, seconds)) * 1000);
}

async function failGeneration(job: { id: string; generationAttempt: number; prompt: { externalPromptId: string } }, reason: string, providerStatus = 'FAILED') {
  const failed = await claimJobTransition(job.id, 'GENERATING', 'FAILED', 'worker').catch(() => false);
  if (!failed) return;
  await prisma.productionJob.update({ where: { id: job.id }, data: { failureReason: reason, providerStatus, completedAt: new Date(), nextPollAt: null } });
  console.error(`[JOB ${job.prompt.externalPromptId}] failed: ${reason}`);
  await notifyJobFailureOnce({ jobId: job.id, externalPromptId: job.prompt.externalPromptId, generationAttempt: job.generationAttempt, reason }).catch(() => undefined);
}

async function pollOneGeneration() {
  const now = new Date();
  const generating = await prisma.productionJob.findFirst({
    where: { status: 'GENERATING', OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }] },
    include: { prompt: true },
    orderBy: [{ nextPollAt: 'asc' }, { updatedAt: 'asc' }]
  });
  if (!generating) return false;

  const providerJobId = generating.creationId || generating.providerJobId;
  if (!providerJobId) {
    const decision = generationWorkDecision({ ...generating, startedAt: generating.startedAt || generating.updatedAt }, now);
    if (decision === 'WAIT') return true;
    await failGeneration(generating, 'Generation submission outcome is unknown after worker interruption. Automatic resubmission is blocked to prevent duplicate paid work; inspect OpenArt history before retrying.', 'SUBMISSION_UNCERTAIN');
    return true;
  }

  try {
    const provider = await getVideoGenerationProvider(generating.provider);
    const result = await provider.getJobStatus(providerJobId);
    const status = result.providerStatus || result.status;
    if (status !== generating.providerStatus) console.info(`[JOB ${generating.prompt.externalPromptId}] status: ${status.toLowerCase()}`);

    if (result.status === 'FAILED') {
      await failGeneration(generating, errorMessage(result.failureReason, 'OpenArt generation failed'), status);
      return true;
    }

    if (result.status === 'READY_FOR_REVIEW') {
      if (!result.videoUrl && generating.provider !== 'mock' && generating.provider !== 'mock-demo') {
        await failGeneration(generating, 'Provider reported completion without an accessible video asset', 'COMPLETED_WITHOUT_MEDIA');
        return true;
      }
      await prisma.productionJob.update({ where: { id: generating.id }, data: {
        providerJobId,
        creationId: generating.provider === 'openart-mcp' ? providerJobId : generating.creationId,
        providerStatus: status,
        providerMetadata: result.providerMetadata as Prisma.InputJsonValue | undefined,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        actualDuration: result.actualDuration || generating.actualDuration,
        lastPolledAt: now,
        nextPollAt: null,
        completedAt: now,
        failureReason: null
      } });
      const claimed = await claimJobTransition(generating.id, 'GENERATING', 'READY_FOR_REVIEW', 'worker');
      if (claimed) {
        console.info(`[JOB ${generating.prompt.externalPromptId}] completed`);
        if (result.videoUrl) console.info(`[JOB ${generating.prompt.externalPromptId}] media URL captured`);
        await notifyReviewReady({
          jobId: generating.id,
          externalPromptId: generating.prompt.externalPromptId,
          concept: generating.prompt.concept,
          durationSeconds: generating.requestedDuration,
          provider: generating.provider,
          origin: generating.origin,
          creationId: generating.creationId || providerJobId,
          providerStatus: status,
          generationAttempt: generating.generationAttempt
        }).catch(() => undefined);
      }
    } else {
      await prisma.productionJob.update({ where: { id: generating.id }, data: {
        providerStatus: status,
        providerMetadata: result.providerMetadata as Prisma.InputJsonValue | undefined,
        lastPolledAt: now,
        nextPollAt: nextPollDate(result.nextPollSeconds),
        failureReason: null
      } });
    }
    return true;
  } catch (error) {
    const reason = errorMessage(error, 'Generation polling temporarily failed');
    console.warn(`[JOB ${generating.prompt.externalPromptId}] polling delayed: ${reason}`);
    await prisma.productionJob.update({ where: { id: generating.id }, data: { failureReason: `Polling will retry: ${reason}`, lastPolledAt: now, nextPollAt: nextPollDate(60) } }).catch(() => undefined);
    return true;
  }
}

async function startOneGeneration() {
  const candidates = await prisma.productionJob.findMany({
    where: { status: 'QUEUED' },
    include: { prompt: true },
    orderBy: { createdAt: 'asc' },
    take: 25
  });
  const queued = candidates.find((candidate) => !autopilotExecutionBlocked(candidate));
  if (!queued) return false;

  if (autopilotExecutionBlocked(queued)) return false;

  const claimed = await claimJobTransition(queued.id, 'QUEUED', 'GENERATING', 'worker');
  if (!claimed) return true;

  try {
    const providerName = effectiveVideoProvider(queued.provider);
    const attempt = queued.generationAttempt + 1;
    await prisma.productionJob.update({ where: { id: queued.id }, data: { provider: providerName, generationAttempt: attempt, providerStatus: 'PREPARING', startedAt: new Date(), lastPolledAt: null, nextPollAt: null, completedAt: null, failureReason: null } });
    const creativePlan = await prepareCreativePlan(queued);
    const provider = await getVideoGenerationProvider(providerName);
    await prisma.productionJob.update({ where: { id: queued.id }, data: { providerStatus: 'SUBMITTING' } });
    console.info(`[JOB ${queued.prompt.externalPromptId}] submitting generation`);
    const result = await provider.generateVideo({
      jobId: queued.id,
      externalJobId: queued.prompt.externalPromptId,
      prompt: JSON.stringify(creativePlan),
      durationSeconds: queued.requestedDuration
    });

    await prisma.productionJob.update({ where: { id: queued.id }, data: {
      providerJobId: result.providerJobId,
      creationId: providerName === 'openart-mcp' ? result.providerJobId : null,
      providerStatus: result.providerStatus || result.status,
      providerMetadata: result.providerMetadata as Prisma.InputJsonValue | undefined,
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      actualDuration: result.actualDuration,
      lastPolledAt: new Date(),
      nextPollAt: result.status === 'GENERATING' ? nextPollDate(result.nextPollSeconds) : null
    } });
    console.info(`[JOB ${queued.prompt.externalPromptId}] ${providerName === 'openart-mcp' ? 'OpenArt creation' : 'provider job'}: ${result.providerJobId}`);
    console.info(`[JOB ${queued.prompt.externalPromptId}] status: ${(result.providerStatus || result.status).toLowerCase()}`);

    if (result.status === 'READY_FOR_REVIEW') {
      if (!result.videoUrl && providerName !== 'mock' && providerName !== 'mock-demo') throw new Error('Provider completed without an accessible video URL');
      await prisma.productionJob.update({ where: { id: queued.id }, data: { completedAt: new Date() } });
      const ready = await claimJobTransition(queued.id, 'GENERATING', 'READY_FOR_REVIEW', 'worker');
      if (ready) {
        console.info(`[JOB ${queued.prompt.externalPromptId}] completed`);
        if (result.videoUrl) console.info(`[JOB ${queued.prompt.externalPromptId}] media URL captured`);
        await notifyReviewReady({
          jobId: queued.id,
          externalPromptId: queued.prompt.externalPromptId,
          concept: queued.prompt.concept,
          durationSeconds: queued.requestedDuration,
          provider: providerName,
          origin: queued.origin,
          creationId: result.providerJobId,
          providerStatus: result.providerStatus || result.status,
          generationAttempt: attempt
        }).catch(() => undefined);
      }
    }
    return true;
  } catch (error) {
    const reason = errorMessage(error, 'Creative planning or generation failed');
    const current = await prisma.productionJob.findUnique({ where: { id: queued.id }, select: { providerStatus: true, generationAttempt: true } });
    const uncertain = current?.providerStatus === 'SUBMITTING' && effectiveVideoProvider(queued.provider) === 'openart-mcp';
    await failGeneration({ ...queued, generationAttempt: current?.generationAttempt || queued.generationAttempt + 1 }, reason, uncertain ? 'SUBMISSION_UNCERTAIN' : 'FAILED');
    return true;
  }
}

async function processOneGenerationJob() {
  if (await pollOneGeneration()) return;
  await startOneGeneration();
}

async function maybeRunAutopilot() {
  if (Date.now() - lastAutopilotTickAt < 60_000) return;
  lastAutopilotTickAt = Date.now();
  const result = await runAutopilotTick();
  if (result.status === 'queued') {
    await notifyOperator(
      `🤖 Autopilot queued ${result.externalPromptId}.\nCategory: ${result.category}\nChannel: ${result.channelType}\nSelection score: ${result.selectionScore}\n\nIt still requires your review before publishing.`
    ).catch(() => undefined);
  }
}

async function notifyUpcomingSchedule() {
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60 * 1000);
  const jobs = await prisma.productionJob.findMany({
    where: { status: 'SCHEDULED', schedule: { publishAt: { gt: now, lte: soon }, status: 'PENDING' } },
    include: { prompt: true, schedule: true, channel: true },
    take: 5
  });

  for (const job of jobs) {
    if (!job.schedule) continue;
    const sent = await prisma.activityLog.findFirst({ where: { action: 'SCHEDULE_REMINDER_SENT', entityType: 'ProductionJob', entityId: job.id } });
    if (sent) continue;
    await notifyOperator(`⏰ ${job.prompt.externalPromptId} is scheduled in less than 15 minutes.\nChannel: ${job.channel.name}\nVisibility: ${job.schedule.visibility}`).catch(() => undefined);
    await prisma.activityLog.create({ data: { actor: 'worker', action: 'SCHEDULE_REMINDER_SENT', entityType: 'ProductionJob', entityId: job.id } });
  }
}

async function processOnePublishJob() {
  const due = await prisma.productionJob.findFirst({
    where: { status: 'SCHEDULED', schedule: { publishAt: { lte: new Date() }, status: 'PENDING' } },
    include: { prompt: true, schedule: true, channel: true },
    orderBy: { schedule: { publishAt: 'asc' } }
  });
  if (!due?.schedule) return;

  const claimed = await claimJobTransition(due.id, 'SCHEDULED', 'PUBLISHING', 'worker');
  if (!claimed) return;

  const publishingName = process.env.PUBLISHING_PROVIDER || 'mock';
  try {
    await prisma.publishSchedule.update({ where: { jobId: due.id }, data: { status: 'PROCESSING' } });
    if (publishingName === 'youtube' && !due.videoUrl) throw new Error('Real YouTube publishing requires a generated video URL');

    const publishingProvider = await getPublishingProvider(publishingName);
    const result = await publishingProvider.uploadVideo({
      jobId: due.id,
      factoryChannelId: due.channelId,
      videoUrl: due.videoUrl || 'mock://generated-video',
      title: due.title || due.prompt.concept.slice(0, 55),
      description: [due.description || '', due.hashtags.join(' ')].filter(Boolean).join('\n\n'),
      visibility: due.schedule.visibility,
      madeForKids: due.prompt.channelType === 'KIDS_CHANNEL_ONLY',
      tags: due.hashtags
    });

    const recordStatus = publishingName === 'youtube' ? 'YOUTUBE_UPLOADED' : 'MOCK_PUBLISHED';
    const actualVisibility = result.visibility ?? 'PRIVATE';
    await prisma.publishRecord.upsert({
      where: { jobId: due.id },
      create: { jobId: due.id, youtubeVideoId: result.externalVideoId, publishedAt: new Date(), visibility: actualVisibility, status: recordStatus },
      update: { youtubeVideoId: result.externalVideoId, publishedAt: new Date(), visibility: actualVisibility, status: recordStatus, error: null }
    });
    await prisma.publishSchedule.update({ where: { jobId: due.id }, data: { status: 'COMPLETED' } });
    await transitionJob(due.id, 'PUBLISHED', { actor: 'worker' });

    if (publishingName === 'youtube') {
      await notifyOperator(`✅ ${due.prompt.externalPromptId} uploaded to ${due.channel.name} as ${actualVisibility}.\nVideo ID: ${result.externalVideoId ?? 'unknown'}`).catch(() => undefined);
    } else {
      await notifyOperator(`✅ ${due.prompt.externalPromptId} completed the MOCK publishing flow. No real YouTube upload occurred.`).catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Publishing failed';
    const failed = await claimJobTransition(due.id, 'PUBLISHING', 'FAILED', 'worker').catch(() => false);
    if (failed) {
      await prisma.publishSchedule.update({ where: { jobId: due.id }, data: { status: 'FAILED' } }).catch(() => undefined);
      await prisma.publishRecord.upsert({
        where: { jobId: due.id },
        create: { jobId: due.id, visibility: 'PRIVATE', status: 'FAILED', error: message },
        update: { status: 'FAILED', error: message }
      }).catch(() => undefined);
      await notifyOperator(`⚠️ Publishing failed for ${due.prompt.externalPromptId} on ${due.channel.name}.`).catch(() => undefined);
    }
  }
}

async function maybeSyncAnalytics() {
  if ((process.env.PUBLISHING_PROVIDER || 'mock') !== 'youtube') return;

  const intervalMinutes = Math.max(5, Number(process.env.ANALYTICS_SYNC_MINUTES || 30));
  const intervalMs = intervalMinutes * 60_000;
  if (Date.now() - lastAnalyticsSyncAt < intervalMs) return;
  lastAnalyticsSyncAt = Date.now();

  const summary = await syncPublishedAnalytics({ limit: 50, minAgeMinutes: intervalMinutes }).catch((error) => ({
    eligible: 0,
    synced: 0,
    skippedFresh: 0,
    failed: 1,
    failures: [{ jobId: 'batch', reason: error instanceof Error ? error.message : 'Analytics sync failed' }]
  }));
  if (summary.failed > 0) console.warn(`Analytics sync completed with ${summary.failed} failure(s).`);
}

async function processCycle() {
  if (Date.now() - lastHeartbeatAt >= 30_000) {
    lastHeartbeatAt = Date.now();
    await prisma.activityLog.create({ data: { actor: 'worker', action: 'WORKER_HEARTBEAT', entityType: 'Worker', entityId: 'generation-worker', metadata: { videoProvider: effectiveVideoProvider(), zeroCostMode: zeroCostMode(), publishingProvider: process.env.PUBLISHING_PROVIDER || 'mock' } } });
    await prisma.activityLog.deleteMany({ where: { action: 'WORKER_HEARTBEAT', createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } }).catch(() => undefined);
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  if (!settings?.productionPaused) {
    await maybeRunAutopilot();
    await processOneGenerationJob();
  }
  if (!settings?.publishingPaused) {
    await notifyUpcomingSchedule();
    await processOnePublishJob();
  }
  await maybeSyncAnalytics();
  await sweepReadyReviewNotifications();
}

async function main() {
  const runtime = readinessSummary(evaluateRuntimeSafety(process.env));
  if (!runtime.ready) {
    throw new Error(`Worker startup blocked by runtime configuration: ${runtime.blocking.map((item) => item.name).join(', ')}`);
  }
  await prisma.$queryRaw`SELECT 1`;

  if (!zeroCostMode() && (process.env.VIDEO_PROVIDER || 'mock') === 'openart-mcp') {
    const token = await getOpenArtAccessToken();
    if (!token) throw new Error('Worker startup blocked: OpenArt OAuth could not resolve an access token from the durable credential store or .env fallback');
    console.log('OpenArt OAuth ready. Direct MCP rendering is enabled; no LLM orchestration is used.');
  }

  const bot = createTelegramBot();
  if (bot) {
    // Telegraf launch() stays pending for the lifetime of long polling. Awaiting
    // it here would freeze the worker before the production loop ever starts.
    void bot.launch()
      .then(() => console.log('Telegram control bot polling stopped.'))
      .catch((error) => console.error('Telegram control bot polling failed:', error instanceof Error ? error.message : 'unknown error'));
    console.log('Telegram control bot started in background.');
  } else {
    console.log('Telegram disabled until TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_ID are configured.');
  }

  console.log(`Karzoun Media Factory worker started. Video provider: ${effectiveVideoProvider()}. Publishing provider: ${process.env.PUBLISHING_PROVIDER || 'mock'}.${zeroCostMode() ? ' ZERO-COST TEST MODE: external AI and paid generation are blocked.' : ''}`);
  while (!stopping) {
    try {
      await processCycle();
    } catch (error) {
      console.error('Worker cycle failed:', error instanceof Error ? error.message : 'unknown error');
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  bot?.stop('shutdown');
  await prisma.$disconnect();
}

const shutdown = () => { stopping = true; };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

main().catch(async (error) => {
  console.error('Worker failed:', error instanceof Error ? error.message : 'unknown error');
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
