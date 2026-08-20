import { prisma } from './lib/prisma';
import { attachGeneratedMedia, transitionJob } from './lib/control-plane';
import { MockPublishingProvider, MockVideoProvider } from './lib/providers';
import { createTelegramBot, notifyOperator } from './lib/telegram';

const videoProvider = new MockVideoProvider();
const publishingProvider = new MockPublishingProvider();
let stopping = false;

async function processOneGenerationJob() {
  const queued = await prisma.productionJob.findFirst({
    where: { status: 'QUEUED', provider: { startsWith: 'mock' } },
    include: { prompt: true },
    orderBy: { createdAt: 'asc' }
  });

  if (queued) {
    try {
      const result = await videoProvider.generateVideo({ jobId: queued.id, prompt: queued.prompt.fullPrompt, durationSeconds: queued.requestedDuration });
      await transitionJob(queued.id, 'GENERATING', { actor: 'worker' });
      await attachGeneratedMedia(queued.id, { providerJobId: result.providerJobId });
    } catch (error) {
      await transitionJob(queued.id, 'FAILED', { actor: 'worker' }).catch(() => undefined);
      await prisma.productionJob.update({ where: { id: queued.id }, data: { failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Mock generation failed' } }).catch(() => undefined);
      await notifyOperator(`⚠️ Generation failed for ${queued.prompt.externalPromptId}.`).catch(() => undefined);
    }
    return;
  }

  const generating = await prisma.productionJob.findFirst({
    where: { status: 'GENERATING', provider: { startsWith: 'mock' }, providerJobId: { not: null } },
    include: { prompt: true },
    orderBy: { updatedAt: 'asc' }
  });

  if (!generating?.providerJobId) return;
  try {
    const result = await videoProvider.getJobStatus(generating.providerJobId);
    if (result.status !== 'READY_FOR_REVIEW') return;
    await attachGeneratedMedia(generating.id, { videoUrl: result.videoUrl, thumbnailUrl: result.thumbnailUrl });
    await transitionJob(generating.id, 'READY_FOR_REVIEW', { actor: 'worker' });
    await notifyOperator(`🎬 ${generating.prompt.externalPromptId} is ready for review.\nOpen the bot with /review or use the dashboard.`).catch(() => undefined);
  } catch (error) {
    await transitionJob(generating.id, 'FAILED', { actor: 'worker' }).catch(() => undefined);
    await prisma.productionJob.update({ where: { id: generating.id }, data: { failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Mock generation poll failed' } }).catch(() => undefined);
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
      videoUrl: due.videoUrl || '/demo/sample-short.mp4',
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

  console.log('Karzoun Media Factory worker started in mock-safe mode.');
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
