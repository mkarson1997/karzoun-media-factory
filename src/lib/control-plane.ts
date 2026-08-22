import { JobStatus as PrismaJobStatus, ReviewDecisionType, ReviewSource, Visibility } from '@prisma/client';
import { prisma } from './prisma';
import { assertTransition, type JobStatus } from './job-state-machine';
import { sendTelegramNotification } from './telegram-api';

const PRODUCTION_QUEUE_LOCK_ID = 88440021;
const PUBLISH_SCHEDULE_LOCK_ID = 88440031;

export async function getFactoryCounters() {
  const [promptCount, grouped] = await Promise.all([
    prisma.prompt.count({ where: { active: true } }),
    prisma.productionJob.groupBy({ by: ['status'], _count: { _all: true } })
  ]);

  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all])) as Partial<Record<PrismaJobStatus, number>>;
  return {
    prompts: promptCount,
    DRAFT: counts.DRAFT ?? 0,
    QUEUED: counts.QUEUED ?? 0,
    GENERATING: counts.GENERATING ?? 0,
    READY_FOR_REVIEW: counts.READY_FOR_REVIEW ?? 0,
    APPROVED: counts.APPROVED ?? 0,
    REJECTED: counts.REJECTED ?? 0,
    SCHEDULED: counts.SCHEDULED ?? 0,
    PUBLISHING: counts.PUBLISHING ?? 0,
    PUBLISHED: counts.PUBLISHED ?? 0,
    FAILED: counts.FAILED ?? 0,
    CANCELLED: counts.CANCELLED ?? 0
  };
}

export async function listPrompts(input?: { search?: string; channelType?: 'GENERAL' | 'KIDS_CHANNEL_ONLY'; active?: boolean; take?: number }) {
  const search = input?.search?.trim();
  return prisma.prompt.findMany({
    where: {
      active: input?.active,
      channelType: input?.channelType,
      OR: search ? [
        { externalPromptId: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { concept: { contains: search, mode: 'insensitive' } }
      ] : undefined
    },
    include: {
      jobs: {
        where: { status: { not: PrismaJobStatus.CANCELLED } },
        select: { id: true, status: true, provider: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(input?.take ?? 50, 100)
  });
}

export async function listJobs(input?: { status?: PrismaJobStatus; take?: number }) {
  return prisma.productionJob.findMany({
    where: { status: input?.status },
    include: { prompt: true, channel: true, schedule: true },
    orderBy: { updatedAt: 'desc' },
    take: Math.min(input?.take ?? 50, 100)
  });
}

export async function queuePrompt(promptId: string, actor = 'dashboard') {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PRODUCTION_QUEUE_LOCK_ID})`;

    const prompt = await tx.prompt.findUnique({ where: { id: promptId } });
    if (!prompt || !prompt.active) throw new Error('Prompt not found or inactive');

    const duplicate = await tx.productionJob.findFirst({
      where: { promptId: prompt.id, status: { not: PrismaJobStatus.CANCELLED } },
      select: { id: true, status: true }
    });
    if (duplicate) throw new Error(`Prompt already has a production job (${duplicate.status}); use Regenerate instead`);

    const channel = await tx.channel.findFirst({
      where: { enabled: true, type: prompt.channelType },
      orderBy: { createdAt: 'asc' }
    });
    if (!channel) throw new Error(`No enabled ${prompt.channelType} channel is configured`);

    const settings = await tx.appSettings.findUnique({ where: { id: 'singleton' } });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentJobs = await tx.productionJob.count({ where: { createdAt: { gte: since }, status: { not: PrismaJobStatus.CANCELLED } } });
    if (settings && recentJobs >= settings.dailyProductionLimit) {
      throw new Error(`Daily production limit reached (${settings.dailyProductionLimit})`);
    }

    const job = await tx.productionJob.create({
      data: {
        promptId: prompt.id,
        channelId: channel.id,
        status: PrismaJobStatus.QUEUED,
        provider: process.env.VIDEO_PROVIDER || 'mock',
        requestedDuration: prompt.targetDurationSeconds
      }
    });

    await tx.activityLog.create({
      data: { actor, action: 'JOB_QUEUED', entityType: 'ProductionJob', entityId: job.id, metadata: { promptId, channelId: channel.id } }
    });
    return job;
  });
}

export async function transitionJob(jobId: string, to: JobStatus, options?: { actor?: string; source?: 'DASHBOARD' | 'TELEGRAM'; notes?: string }) {
  const actor = options?.actor ?? 'system';
  const result = await prisma.$transaction(async (tx) => {
    const job = await tx.productionJob.findUnique({ where: { id: jobId }, include: { prompt: true } });
    if (!job) throw new Error('Production job not found');

    assertTransition(job.status as JobStatus, to);
    const updated = await tx.productionJob.update({
      where: { id: job.id },
      data: {
        status: to as PrismaJobStatus,
        retryCount: to === 'QUEUED' && job.status === PrismaJobStatus.FAILED ? { increment: 1 } : undefined,
        failureReason: to === 'QUEUED' ? null : undefined
      }
    });

    if (to === 'APPROVED' || to === 'REJECTED') {
      await tx.reviewDecision.create({
        data: {
          jobId: job.id,
          decision: to === 'APPROVED' ? ReviewDecisionType.APPROVED : ReviewDecisionType.REJECTED,
          source: options?.source === 'TELEGRAM' ? ReviewSource.TELEGRAM : ReviewSource.DASHBOARD,
          notes: options?.notes
        }
      });
    }

    await tx.activityLog.create({
      data: { actor, action: 'JOB_STATUS_CHANGED', entityType: 'ProductionJob', entityId: job.id, metadata: { from: job.status, to } }
    });
    return { updated, externalPromptId: job.prompt.externalPromptId };
  });

  if (to === 'APPROVED' && options?.source !== 'TELEGRAM' && actor !== 'smoke-test') {
    await sendTelegramNotification(`✅ ${result.externalPromptId} approved and ready to schedule.`).catch(() => undefined);
  }
  return result.updated;
}

export async function claimJobTransition(jobId: string, from: JobStatus, to: JobStatus, actor = 'worker') {
  assertTransition(from, to);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.productionJob.updateMany({ where: { id: jobId, status: from as PrismaJobStatus }, data: { status: to as PrismaJobStatus } });
    if (claimed.count !== 1) return false;
    await tx.activityLog.create({
      data: { actor, action: 'JOB_STATUS_CLAIMED', entityType: 'ProductionJob', entityId: jobId, metadata: { from, to } }
    });
    return true;
  });
}

export async function requestRegeneration(jobId: string, options?: { actor?: string; source?: 'DASHBOARD' | 'TELEGRAM' }) {
  const actor = options?.actor ?? 'system';
  return prisma.$transaction(async (tx) => {
    const job = await tx.productionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Production job not found');
    if (job.status !== PrismaJobStatus.READY_FOR_REVIEW && job.status !== PrismaJobStatus.REJECTED) throw new Error('Regeneration is only available for a review or rejected job');

    if (job.status === PrismaJobStatus.READY_FOR_REVIEW) {
      assertTransition('READY_FOR_REVIEW', 'REJECTED');
      await tx.reviewDecision.create({
        data: {
          jobId: job.id,
          decision: ReviewDecisionType.REJECTED,
          source: options?.source === 'TELEGRAM' ? ReviewSource.TELEGRAM : ReviewSource.DASHBOARD,
          notes: 'Regeneration requested'
        }
      });
    }
    assertTransition('REJECTED', 'QUEUED');

    const updated = await tx.productionJob.update({
      where: { id: job.id },
      data: { status: PrismaJobStatus.QUEUED, providerJobId: null, videoUrl: null, thumbnailUrl: null, failureReason: null, retryCount: { increment: 1 } }
    });
    await tx.activityLog.create({ data: { actor, action: 'JOB_REGENERATION_REQUESTED', entityType: 'ProductionJob', entityId: job.id } });
    return updated;
  });
}

export async function attachGeneratedMedia(jobId: string, input: { providerJobId?: string; videoUrl?: string; thumbnailUrl?: string }) {
  return prisma.productionJob.update({ where: { id: jobId }, data: input });
}

export async function scheduleApprovedJob(jobId: string, input: { publishAt: Date; timezone: string; visibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'; title?: string; description?: string; hashtags?: string[] }, actor = 'dashboard') {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PUBLISH_SCHEDULE_LOCK_ID})`;

    const job = await tx.productionJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Production job not found');
    assertTransition(job.status as JobStatus, 'SCHEDULED');

    const settings = await tx.appSettings.findUnique({ where: { id: 'singleton' } });
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSchedules = await tx.publishSchedule.count({ where: { createdAt: { gte: since } } });
    if (settings && recentSchedules >= settings.dailyPublishingLimit) throw new Error(`Daily publishing limit reached (${settings.dailyPublishingLimit})`);

    const visibility = Visibility[input.visibility ?? 'PRIVATE'];
    const updated = await tx.productionJob.update({
      where: { id: job.id },
      data: { status: PrismaJobStatus.SCHEDULED, title: input.title ?? job.title, description: input.description ?? job.description, hashtags: input.hashtags ?? job.hashtags }
    });

    await tx.publishSchedule.upsert({
      where: { jobId: job.id },
      create: { jobId: job.id, publishAt: input.publishAt, timezone: input.timezone, visibility },
      update: { publishAt: input.publishAt, timezone: input.timezone, visibility, status: 'PENDING' }
    });

    await tx.activityLog.create({
      data: { actor, action: 'JOB_SCHEDULED', entityType: 'ProductionJob', entityId: job.id, metadata: { publishAt: input.publishAt.toISOString(), visibility } }
    });
    return updated;
  });
}

export async function recentActivity(take = 20) {
  return prisma.activityLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(take, 50) });
}
