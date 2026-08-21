import { prisma } from '../src/lib/prisma';

async function main() {
  const prompts = await prisma.prompt.findMany({
    where: { externalPromptId: { startsWith: 'DEMO-' } },
    select: { id: true, externalPromptId: true }
  });

  if (!prompts.length) {
    console.log('Demo cleanup: nothing to remove.');
    return;
  }

  const promptIds = prompts.map((prompt) => prompt.id);
  const jobs = await prisma.productionJob.findMany({ where: { promptId: { in: promptIds } }, select: { id: true } });
  const jobIds = jobs.map((job) => job.id);

  await prisma.$transaction(async (tx) => {
    if (jobIds.length) {
      await tx.activityLog.deleteMany({ where: { entityType: 'ProductionJob', entityId: { in: jobIds } } });
      await tx.productionJob.deleteMany({ where: { id: { in: jobIds } } });
    }
    await tx.prompt.deleteMany({ where: { id: { in: promptIds } } });
    await tx.activityLog.create({
      data: {
        actor: 'maintenance',
        action: 'DEMO_DATA_REMOVED',
        entityType: 'Factory',
        entityId: 'singleton',
        metadata: { prompts: prompts.length, jobs: jobs.length }
      }
    });
  });

  console.log(`Demo cleanup complete: ${prompts.length} prompt(s), ${jobs.length} job(s) removed.`);
}

main()
  .catch((error) => {
    console.error('Demo cleanup failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
