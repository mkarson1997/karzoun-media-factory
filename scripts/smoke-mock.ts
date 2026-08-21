import { ChannelType, JobStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { attachGeneratedMedia, claimJobTransition, queuePrompt, scheduleApprovedJob, transitionJob } from '../src/lib/control-plane';
import { getPublishingProvider, getVideoGenerationProvider } from '../src/lib/providers';

function assertSafeMockEnvironment() {
  const video = process.env.VIDEO_PROVIDER || 'mock';
  const publishing = process.env.PUBLISHING_PROVIDER || 'mock';
  if (video !== 'mock' && video !== 'mock-demo') throw new Error(`Smoke test refuses non-mock VIDEO_PROVIDER=${video}`);
  if (publishing !== 'mock') throw new Error(`Smoke test refuses non-mock PUBLISHING_PROVIDER=${publishing}`);
  if (process.env.ALLOW_PAID_GENERATION === 'true' || process.env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true') {
    throw new Error('Smoke test refuses to run while any paid-generation lock is open');
  }
  if (process.env.ALLOW_YOUTUBE_UPLOAD === 'true' || process.env.ALLOW_PUBLIC_PUBLISHING === 'true') {
    throw new Error('Smoke test refuses to run while any real YouTube publishing lock is open');
  }
}

async function main() {
  assertSafeMockEnvironment();
  await prisma.$queryRaw`SELECT 1`;

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const externalPromptId = `SMOKE-${stamp}`;
  let promptId: string | null = null;
  let jobId: string | null = null;

  const settings = await prisma.appSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  const originalProductionLimit = settings.dailyProductionLimit;
  const originalPublishingLimit = settings.dailyPublishingLimit;
  const originalProductionPaused = settings.productionPaused;
  const originalPublishingPaused = settings.publishingPaused;
  const originalAutopilotEnabled = settings.autopilotEnabled;

  try {
    // Hold both background lanes while the smoke script drives the state machine
    // directly. This prevents a concurrently running worker from racing the test.
    await prisma.appSettings.update({
      where: { id: 'singleton' },
      data: {
        productionPaused: true,
        publishingPaused: true,
        autopilotEnabled: false,
        dailyProductionLimit: Math.max(originalProductionLimit, 50),
        dailyPublishingLimit: Math.max(originalPublishingLimit, 20)
      }
    });

    const channel = await prisma.channel.findFirst({ where: { enabled: true, type: ChannelType.GENERAL }, orderBy: { createdAt: 'asc' } });
    if (!channel) throw new Error('Smoke test requires one enabled GENERAL channel. Run npm run seed first.');

    const prompt = await prisma.prompt.create({
      data: {
        externalPromptId,
        category: 'Smoke Test',
        concept: 'Safe mock end-to-end acceptance flow',
        fullPrompt: 'Create an original mock-only vertical short used solely to prove the factory state machine. No external provider calls.',
        targetDurationSeconds: 35,
        channelType: ChannelType.GENERAL,
        active: true
      }
    });
    promptId = prompt.id;

    const queued = await queuePrompt(prompt.id, 'smoke-test');
    jobId = queued.id;
    if (queued.status !== JobStatus.QUEUED) throw new Error(`Expected QUEUED, got ${queued.status}`);

    const claimed = await claimJobTransition(queued.id, 'QUEUED', 'GENERATING', 'smoke-test');
    if (!claimed) throw new Error('Could not claim generation transition');

    const videoProvider = await getVideoGenerationProvider('mock');
    const started = await videoProvider.generateVideo({ jobId: queued.id, prompt: prompt.fullPrompt, durationSeconds: prompt.targetDurationSeconds });
    await attachGeneratedMedia(queued.id, { providerJobId: started.providerJobId, videoUrl: started.videoUrl, thumbnailUrl: started.thumbnailUrl });

    const completed = await videoProvider.getJobStatus(started.providerJobId);
    await attachGeneratedMedia(queued.id, { providerJobId: started.providerJobId, videoUrl: completed.videoUrl, thumbnailUrl: completed.thumbnailUrl });
    const ready = await claimJobTransition(queued.id, 'GENERATING', 'READY_FOR_REVIEW', 'smoke-test');
    if (!ready) throw new Error('Could not move mock render to READY_FOR_REVIEW');

    await transitionJob(queued.id, 'APPROVED', { actor: 'smoke-test', source: 'DASHBOARD' });
    await scheduleApprovedJob(queued.id, {
      publishAt: new Date(Date.now() - 1000),
      timezone: 'UTC',
      visibility: 'PRIVATE',
      title: 'Karzoun Media Factory Smoke Test',
      description: 'Mock-only smoke test. No real upload.',
      hashtags: ['#SmokeTest']
    }, 'smoke-test');

    const publishing = await getPublishingProvider('mock');
    const publishingClaim = await claimJobTransition(queued.id, 'SCHEDULED', 'PUBLISHING', 'smoke-test');
    if (!publishingClaim) throw new Error('Could not claim publishing transition');

    const published = await publishing.uploadVideo({
      jobId: queued.id,
      factoryChannelId: channel.id,
      videoUrl: 'mock://generated-video',
      title: 'Karzoun Media Factory Smoke Test',
      description: 'Mock-only smoke test. No real upload.',
      visibility: 'PRIVATE',
      madeForKids: false,
      tags: ['#SmokeTest']
    });

    await prisma.publishRecord.upsert({
      where: { jobId: queued.id },
      create: { jobId: queued.id, youtubeVideoId: published.externalVideoId, publishedAt: new Date(), visibility: 'PRIVATE', status: 'MOCK_PUBLISHED' },
      update: { youtubeVideoId: published.externalVideoId, publishedAt: new Date(), visibility: 'PRIVATE', status: 'MOCK_PUBLISHED', error: null }
    });
    await prisma.publishSchedule.update({ where: { jobId: queued.id }, data: { status: 'COMPLETED' } });
    await transitionJob(queued.id, 'PUBLISHED', { actor: 'smoke-test' });

    const final = await prisma.productionJob.findUnique({ where: { id: queued.id }, include: { publishRecord: true, schedule: true } });
    if (!final || final.status !== JobStatus.PUBLISHED) throw new Error(`Expected PUBLISHED, got ${final?.status ?? 'missing'}`);
    if (final.publishRecord?.status !== 'MOCK_PUBLISHED') throw new Error('Mock publish record was not created');
    if (final.schedule?.status !== 'COMPLETED') throw new Error('Mock publish schedule did not complete');

    console.log('PASS  Karzoun Media Factory mock end-to-end smoke test');
    console.log(`PASS  ${externalPromptId}: QUEUED → GENERATING → READY_FOR_REVIEW → APPROVED → SCHEDULED → PUBLISHING → PUBLISHED`);
    console.log('PASS  No paid provider, Telegram notification or real YouTube publishing was allowed');
  } finally {
    if (jobId) await prisma.productionJob.deleteMany({ where: { id: jobId } }).catch(() => undefined);
    if (promptId) await prisma.prompt.deleteMany({ where: { id: promptId } }).catch(() => undefined);
    await prisma.appSettings.update({
      where: { id: 'singleton' },
      data: {
        dailyProductionLimit: originalProductionLimit,
        dailyPublishingLimit: originalPublishingLimit,
        productionPaused: originalProductionPaused,
        publishingPaused: originalPublishingPaused,
        autopilotEnabled: originalAutopilotEnabled
      }
    }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('FAIL  Mock smoke test:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
