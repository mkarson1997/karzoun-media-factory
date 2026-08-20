import type { Prisma } from '@prisma/client';
import { prisma } from './lib/prisma';
import { attachGeneratedMedia, transitionJob } from './lib/control-plane';
import { getCreativeDirector, type CreativePlan } from './lib/creative-director';
import { MockPublishingProvider, MockVideoProvider } from './lib/providers';
import { createTelegramBot, notifyOperator } from './lib/telegram';

const videoProvider = new MockVideoProvider();
const publishingProvider = new MockPublishingProvider();
let stopping = false;

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
    data: { actor: 'creative-director', action: 'CREATIVE_PLAN_PREPARED', entityType: 'ProductionJob', entityId: job.id, metadata: { model: result.model } }
  });
  return result.plan;
}

async function processOneGenerationJob() {
  const generating = await prisma.productionJob.findFirst({
    where: { status: 'GENERATING', provider: { startsWith: 'mock' }, providerJobId: { not: null } },
    include: { prompt: true },
    orderBy: { updatedAt: 'asc' }
  });

  if (generating?.providerJobId) {
    try {
      const result = await videoProvider.getJobStatus(generating.providerJobId);
      if (result.status !== 'READY_FOR_REVIEW') return;
      await attachGeneratedMedia(generating.id, { videoUrl: result.videoUrl, thumbnailUrl: result.thumbnailUrl });
      await transitionJob(generating.id, 'READY_FOR_REVIEW', { actor: 'worker' });
      await notifyOperator(`🎬 ${generating.prompt.externalPromptId} is ready for review.\nOpen the bot with /review or use the dashboard.`).catch(() => undefined);
    } catch (error) {
      await transitionJob(generating.id, 'FAILED', { actor: 'worker' }).catch(() => undefined);
      await prisma.productionJob.update({ where: { id: generating.id }, data: { failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Mock generation poll failed' } }).catch(() => undefined);
      await notifyOperator(`⚠️ Generation failed for ${generating.prompt.externalPromptId}.`).catch(() => undefined);
    }
    return;
  }

  const queued = await prisma.productionJob.findFirst({
    where: { status: 'QUEUED', provider: { startsWith: 'mock' } },
    include: { prompt: true },
    orderBy: { createdAt: 'asc' }
  });
  if (!queued) return;

  try {
    const creativePlan = await prepareCreativePlan(queued);
    const result = await videoProvider.generateVideo({
      jobId: queued.id,
      prompt: JSON.stringify(creativePlan),
      durationSeconds: queued.requestedDuration
    });
    await transitionJob(queued.id, 'GENERATING', { actor: 'worker' });
    await attachGeneratedMedia(queued.id, { providerJobId: result.providerJobId });
  } catch (error) {
    await transitionJob(queued.id, 'FAILED', { actor: 'worker' }).catch(() => undefined);
    await prisma.productionJob.update({ where: { id: queued.id }, data: { failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Creative planning or generation failed' } }).catch(() => undefined);
    await notifyOperator(`⚠️ Creative planning/generation failed for ${queued.prompt.externalPromptId}.`).catch(() => undefined);
  }
}

async function notifyUpcomingSchedule() {
  const now = new Date();
  const soon = new Date(now.getTime() + 15 * 60 * 1000);
  const jobs = await prisma.productionJob.findMany({
    where: { status: 'SCHEDULED', schedule: { publishAt: { gt: now, lte: soon }, status: 'PENDING' } },
    include: { prompt: true, schedule: true },
    take: 5
  });

  for (const job of jobs) {
    if (!job.schedule) continue;
    const sent = await prisma.activityLog.findFirst({ where: { action: 'SCHEDULE_REMINDER_SENT', entityType: 'ProductionJob', entityId: job.id } });
    if (sent) continue;
    await notifyOperator(`⏰ ${job.prompt.externalPromptId} is scheduled in less than 15 minutes.\nVisibility: ${job.schedule.visibility}`).catch(() => undefined);
    await prisma.activityLog.create({ data: { actor: 'worker', action: 'SCHEDULE_REMINDER_SENT', entityType: 'ProductionJob', entityId: job.id } });
  }
}

async function processOnePublishJob() {
  const due = await prisma.productionJob.findFirst({
    where: { status: 'SCHEDULED', provider: { startsWith: 'mock' }, schedule: { publishAt: { lte: new Date() }, status: 'PENDING' } },
    include: { prompt: true, schedule: true },
    orderBy: { schedule: { publishAt: 'asc' } }
  });
  if (!due?.schedule) return;

  try {
    await transitionJob(due.id, 'PUBLISHING', { actor: 'worker' });
    await prisma.publishSchedule.update({ where: { jobId: due.id }, data: { status: 'PROCESSING' } });
    const result = await publishingProvider.uploadVideo({
      jobId: due.id,
      videoUrl: due.videoUrl || 'mock://generated-video',
      title: due.title || due.prompt.concept.slice(0, 55),
      description: due.description || '',
      visibility: due.schedule.visibility
    });
    await prisma.publishRecord.upsert({
      where: { jobId: due.id },
      create: { jobId: due.id, youtubeVideoId: result.externalVideoId, publishedAt: new Date(), status: 'MOCK_PUBLISHED' },
      update: { youtubeVideoId: result.externalVideoId, publishedAt: new Date(), status: 'MOCK_PUBLISHED', error: null }
    });
    await prisma.publishSchedule.update({ where: { jobId: due.id }, data: { status: 'COMPLETED' } });
    await transitionJob(due.id, 'PUBLISHED', { actor: 'worker' });
    await notifyOperator(`✅ ${due.prompt.externalPromptId} completed the MOCK publishing flow. No real YouTube upload occurred.`).catch(() => undefined);
  } catch (error) {
    await transitionJob(due.id, 'FAILED', { actor: 'worker' }).catch(() => undefined);
    await prisma.publishSchedule.update({ where: { jobId: due.id }, data: { status: 'FAILED' } }).catch(() => undefined);
    await notifyOperator(`⚠️ Publishing failed for ${due.prompt.externalPromptId}.`).catch(() => undefined);
  }
}

async function processCycle() {
  await processOneGenerationJob();
  await notifyUpcomingSchedule();
  await processOnePublishJob();
}

async function main() {
  const bot = createTelegramBot();
  if (bot) {
    await bot.launch();
    console.log('Telegram control bot started.');
  } else {
    console.log('Telegram disabled until TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_ID are configured.');
  }

  console.log('Karzoun Media Factory worker started.');
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
