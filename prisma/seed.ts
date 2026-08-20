import { ChannelType, JobStatus, PrismaClient, Visibility } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: {
      id: 'singleton',
      projectName: 'Karzoun Media Factory',
      timezone: 'Europe/Istanbul',
      defaultLanguage: 'en',
      dailyProductionLimit: 3,
      dailyPublishingLimit: 3
    }
  });

  const channel = await prisma.channel.findFirst({ where: { name: 'Karzoun Media Lab' } }) ?? await prisma.channel.create({
    data: {
      name: 'Karzoun Media Lab',
      type: ChannelType.GENERAL,
      enabled: true,
      defaultVisibility: Visibility.PRIVATE
    }
  });

  const demoPrompt = await prisma.prompt.upsert({
    where: { externalPromptId: 'DEMO-0001' },
    update: {},
    create: {
      externalPromptId: 'DEMO-0001',
      category: 'DEMO',
      concept: 'A tiny robot turns a messy desk into a clean creative studio',
      fullPrompt: 'DEMO ONLY: Create an original 35-second vertical transformation short. No external provider should be called.',
      targetDurationSeconds: 35,
      channelType: ChannelType.GENERAL,
      active: true
    }
  });

  const existingDemoJob = await prisma.productionJob.findFirst({ where: { promptId: demoPrompt.id, provider: 'mock-demo' } });
  if (!existingDemoJob) {
    await prisma.productionJob.create({
      data: {
        promptId: demoPrompt.id,
        channelId: channel.id,
        status: JobStatus.READY_FOR_REVIEW,
        provider: 'mock-demo',
        requestedDuration: 35,
        videoUrl: '/demo/sample-short.mp4',
        thumbnailUrl: '/demo/sample-thumb.jpg',
        title: '[DEMO] Tiny Robot Desk Reset',
        description: 'Demo data only. No real video was generated.',
        hashtags: ['#DEMO', '#Shorts']
      }
    });
  }

  console.log('Seed complete: Karzoun Media Lab + clearly marked demo workflow.');
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Seed failed');
    process.exit(1);
  });
