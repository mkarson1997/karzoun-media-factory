import { JobStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

function staleMinutes() {
  const parsed = Number(process.env.STALE_JOB_MINUTES || 90);
  if (!Number.isFinite(parsed) || parsed < 30 || parsed > 1440) return 90;
  return Math.floor(parsed);
}

async function main() {
  const minutes = staleMinutes();
  const cutoff = new Date(Date.now() - minutes * 60_000);

  const staleGeneration = await prisma.productionJob.findMany({
    where: {
      status: JobStatus.GENERATING,
      provider: { notIn: ['mock', 'mock-demo'] },
      updatedAt: { lt: cutoff }
    },
    select: { id: true, provider: true, prompt: { select: { externalPromptId: true } } },
    take: 100
  });

  const stalePublishing = await prisma.productionJob.findMany({
    where: { status: JobStatus.PUBLISHING, updatedAt: { lt: cutoff } },
    select: { id: true, prompt: { select: { externalPromptId: true } } },
    take: 100
  });

  let recoveredGeneration = 0;
  let recoveredPublishing = 0;

  for (const job of staleGeneration) {
    const updated = await prisma.productionJob.updateMany({
      where: { id: job.id, status: JobStatus.GENERATING, updatedAt: { lt: cutoff } },
      data: {
        status: JobStatus.FAILED,
        failureReason: `Generation was interrupted or stale for more than ${minutes} minutes. Retry manually; no automatic paid retry was attempted.`
      }
    });
    if (!updated.count) continue;
    recoveredGeneration++;
    await prisma.activityLog.create({
      data: {
        actor: 'startup-recovery',
        action: 'STALE_GENERATION_QUARANTINED',
        entityType: 'ProductionJob',
        entityId: job.id,
        metadata: { externalPromptId: job.prompt.externalPromptId, provider: job.provider, staleMinutes: minutes }
      }
    });
  }

  for (const job of stalePublishing) {
    const updated = await prisma.productionJob.updateMany({
      where: { id: job.id, status: JobStatus.PUBLISHING, updatedAt: { lt: cutoff } },
      data: {
        status: JobStatus.FAILED,
        failureReason: `Publishing was interrupted or stale for more than ${minutes} minutes. Verify YouTube before retrying to avoid a duplicate upload.`
      }
    });
    if (!updated.count) continue;
    recoveredPublishing++;

    await prisma.publishSchedule.updateMany({ where: { jobId: job.id, status: 'PROCESSING' }, data: { status: 'FAILED' } });
    await prisma.publishRecord.upsert({
      where: { jobId: job.id },
      create: {
        jobId: job.id,
        visibility: 'PRIVATE',
        status: 'UNKNOWN_AFTER_INTERRUPT',
        error: 'Verify the target YouTube channel manually before retrying. The upload may have completed before the worker stopped.'
      },
      update: {
        status: 'UNKNOWN_AFTER_INTERRUPT',
        error: 'Verify the target YouTube channel manually before retrying. The upload may have completed before the worker stopped.'
      }
    });
    await prisma.activityLog.create({
      data: {
        actor: 'startup-recovery',
        action: 'STALE_PUBLISH_QUARANTINED',
        entityType: 'ProductionJob',
        entityId: job.id,
        metadata: { externalPromptId: job.prompt.externalPromptId, staleMinutes: minutes, duplicateRisk: true }
      }
    });
  }

  console.log(`Startup recovery: ${recoveredGeneration} stale generation job(s), ${recoveredPublishing} stale publishing job(s) quarantined.`);
}

main()
  .catch((error) => {
    console.error('Startup recovery failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
