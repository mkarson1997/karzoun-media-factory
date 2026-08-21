import type { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma';
import { runAutopilotTick } from './lib/autopilot';
import { attachGeneratedMedia, claimJobTransition, transitionJob } from './lib/control-plane';
import { getCreativeDirector, type CreativePlan } from './lib/creative-director';
import { evaluateCreativeQuality } from './lib/creative-quality';
import { getPublishingProvider, getVideoGenerationProvider } from './lib/providers';
import { createTelegramBot, notifyOperator } from './lib/telegram';
import { syncPublishedAnalytics } from './lib/youtube-analytics';

let stopping = false;
let lastAnalyticsSyncAt = 0;
let lastAutopilotTickAt = 0;

async function prepareCreativePlan(job: { id: string; requestedDuration: number; creativeBrief: Prisma.JsonValue | null; prompt: { externalPromptId: string; category: string; concept: string; fullPrompt: string; channelType: 'GENERAL' | 'KIDS_CHANNEL_ONLY' } }) {
  if (job.creativeBrief) return job.creativeBrief as unknown as CreativePlan;

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
  if (result.model !== 'mock-creative-director' && quality.blocking.length) {
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
  return result.plan;
}

async function pollOneMockGeneration() {
  const generating = await prisma.productionJob.findFirst({
    where: { status: 'GENERATING', provider: { in: ['mock', 'mock-demo'] }, providerJobId: { not: null } },
    include: { prompt: true },
    orderBy: { updatedAt: 'asc' }
  });
  if (!generating?.providerJobId) return false;

  try {
    const provider = await getVideoGenerationProvider(generating.provider);
    const result = await provider.getJobStatus(generating.providerJobId);
    if (result.status === 'READY_FOR_REVIEW') {
      await attachGeneratedMedia(generating.id, {
        providerJobId: generating.providerJobId,
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl
      });
      const claimed = await claimJobTransition(generating.id, 'GENERATING', 'READY_FOR_REVIEW', 'worker');
      if (claimed) {
        await notifyOperator(`🎬 ${generating.prompt.externalPromptId} is ready for review.\nUse /review in Telegram or open the dashboard.`).catch(() => undefined);
      }
    }
    return true;
  } catch (error) {
    const failed = await claimJobTransition(generating.id, 'GENERATING', 'FAILED', 'worker').catch(() => false);
    if (failed) {
      await prisma.productionJob.update({
        where: { id: generating.id },
        data: { failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Generation polling failed' }
      }).catch(() => undefined);
      await notifyOperator(`⚠️ Generation failed for ${generating.prompt.externalPromptId}.`).catch(() => undefined);
    }
    return true;
  }
}

async function startOneGeneration() {
  const queued = await prisma.productionJob.findFirst({
    where: { status: 'QUEUED' },
    include: { prompt: true },
    orderBy: { createdAt: 'asc' }
  });
  if (!queued) return false;

  const claimed = await claimJobTransition(queued.id, 'QUEUED', 'GENERATING', 'worker');
  if (!claimed) return true;

  try {
    const creativePlan = await prepareCreativePlan(queued);
    const provider = await getVideoGenerationProvider(queued.provider);
    const result = await provider.generateVideo({
      jobId: queued.id,
      prompt: JSON.stringify(creativePlan),
      durationSeconds: queued.requestedDuration
    });

    await attachGeneratedMedia(queued.id, {
      providerJobId: result.providerJobId,
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl
    });

    if (result.status === 'READY_FOR_REVIEW') {
      const ready = await claimJobTransition(queued.id, 'GENERATING', 'READY_FOR_REVIEW', 'worker');
      if (ready) {
        await notifyOperator(`🎬 ${queued.prompt.externalPromptId} is ready for review.\nUse /review in Telegram or open the dashboard.`).catch(() => undefined);
      }
    }
    return true;
  } catch (error) {
    const failed = await claimJobTransition(queued.id, 'GENERATING', 'FAILED', 'worker').catch(() => false);
    if (failed) {
      await prisma.productionJob.update({
        where: { id: queued.id },
        data: { failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Creative planning or generation failed' }
      }).catch(() => undefined);
      await notifyOperator(`⚠️ Creative planning/generation failed for ${queued.prompt.externalPromptId}.`).catch(() => undefined);
    }
    return true;
  }
}

async function processOneGenerationJob() {
  if (await pollOneMockGeneration()) return;
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
}

async function main() {
  const bot = createTelegramBot();
  if (bot) {
    await bot.launch();
    console.log('Telegram control bot started.');
  } else {
    console.log('Telegram disabled until TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_ID are configured.');
  }

  console.log(`Karzoun Media Factory worker started. Video provider: ${process.env.VIDEO_PROVIDER || 'mock'}. Publishing provider: ${process.env.PUBLISHING_PROVIDER || 'mock'}.`);
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
