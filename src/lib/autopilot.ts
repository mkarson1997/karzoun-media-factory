import { ChannelType, JobOrigin, JobStatus, type Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Candidate = {
  id: string;
  externalPromptId: string;
  category: string;
  concept: string;
  targetDurationSeconds: number;
  channelType: ChannelType;
};

type PerformanceSample = {
  jobId: string;
  category: string;
  score: number | null;
};

export type RankedCandidate = Candidate & {
  selectionScore: number;
  categoryAverage: number | null;
  categorySamples: number;
  recentCategoryUses: number;
};

export type AutopilotTickResult =
  | { status: 'queued'; jobId: string; promptId: string; externalPromptId: string; category: string; channelType: ChannelType; selectionScore: number }
  | { status: 'idle'; reason: string }
  | { status: 'blocked'; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const ADVISORY_LOCK_ID = 88440021;

function categoryStats(samples: PerformanceSample[]) {
  const latest = new Map<string, PerformanceSample>();
  for (const sample of samples) if (!latest.has(sample.jobId)) latest.set(sample.jobId, sample);

  const stats = new Map<string, { total: number; count: number }>();
  for (const sample of latest.values()) {
    if (sample.score == null || !Number.isFinite(sample.score)) continue;
    const current = stats.get(sample.category) ?? { total: 0, count: 0 };
    current.total += sample.score;
    current.count += 1;
    stats.set(sample.category, current);
  }
  return stats;
}

export function rankAutopilotCandidates(
  candidates: Candidate[],
  samples: PerformanceSample[],
  recentCategories: string[]
): RankedCandidate[] {
  const stats = categoryStats(samples);
  const recentCounts = recentCategories.reduce<Map<string, number>>((map, category) => {
    map.set(category, (map.get(category) ?? 0) + 1);
    return map;
  }, new Map());

  return candidates
    .map((candidate) => {
      const stat = stats.get(candidate.category);
      const average = stat?.count ? stat.total / stat.count : null;
      const sampleCount = stat?.count ?? 0;
      const recentUses = recentCounts.get(candidate.category) ?? 0;

      // Start unexplored categories near the middle so the factory still explores.
      // Categories with real results gradually win, while a recency penalty avoids
      // generating the same theme repeatedly in one batch.
      const performanceBase = average ?? 55;
      const explorationBonus = sampleCount === 0 ? 6 : sampleCount < 3 ? 3 : 0;
      const recencyPenalty = recentUses * 8;
      const selectionScore = Math.round((performanceBase + explorationBonus - recencyPenalty) * 100) / 100;

      return {
        ...candidate,
        selectionScore,
        categoryAverage: average == null ? null : Math.round(average * 100) / 100,
        categorySamples: sampleCount,
        recentCategoryUses: recentUses
      };
    })
    .sort((a, b) => b.selectionScore - a.selectionScore || a.externalPromptId.localeCompare(b.externalPromptId));
}

function generationSafetyBlock() {
  const provider = process.env.VIDEO_PROVIDER || 'mock';
  const isMock = provider === 'mock' || provider === 'mock-demo';
  if (!isMock && process.env.ALLOW_PAID_GENERATION !== 'true') {
    return `Autopilot is armed but paid generation is locked for provider ${provider}`;
  }
  return null;
}

export async function getAutopilotStatus() {
  const since = new Date(Date.now() - DAY_MS);
  const settings = await prisma.appSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  const [generalQueued, kidsQueued, totalJobs, unusedGeneral, unusedKids] = await Promise.all([
    prisma.productionJob.count({ where: { origin: JobOrigin.AUTOPILOT, prompt: { channelType: ChannelType.GENERAL }, createdAt: { gte: since } } }),
    prisma.productionJob.count({ where: { origin: JobOrigin.AUTOPILOT, prompt: { channelType: ChannelType.KIDS_CHANNEL_ONLY }, createdAt: { gte: since } } }),
    prisma.productionJob.count({ where: { createdAt: { gte: since }, status: { not: JobStatus.CANCELLED } } }),
    prisma.prompt.count({ where: { active: true, channelType: ChannelType.GENERAL, jobs: { none: {} } } }),
    prisma.prompt.count({ where: { active: true, channelType: ChannelType.KIDS_CHANNEL_ONLY, jobs: { none: {} } } })
  ]);

  return {
    enabled: settings.autopilotEnabled,
    kidsEnabled: settings.autopilotKidsEnabled,
    productionPaused: settings.productionPaused,
    rolling24h: {
      generalQueued,
      kidsQueued,
      totalJobs,
      generalTarget: settings.autopilotGeneralDailyTarget,
      kidsTarget: settings.autopilotKidsDailyTarget,
      globalLimit: settings.dailyProductionLimit
    },
    unused: { general: unusedGeneral, kids: unusedKids },
    safetyBlock: generationSafetyBlock()
  };
}

export async function setAutopilotEnabled(enabled: boolean, actor: string) {
  const settings = await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', autopilotEnabled: enabled },
    update: { autopilotEnabled: enabled }
  });
  await prisma.activityLog.create({
    data: {
      actor,
      action: enabled ? 'AUTOPILOT_ENABLED' : 'AUTOPILOT_DISABLED',
      entityType: 'AppSettings',
      entityId: settings.id
    }
  });
  return settings;
}

export async function runAutopilotTick(): Promise<AutopilotTickResult> {
  const safety = generationSafetyBlock();
  if (safety) return { status: 'blocked', reason: safety };

  return prisma.$transaction(async (tx) => {
    // Prevent two workers from filling the same daily slot at the same time.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_ID})`;

    const settings = await tx.appSettings.findUnique({ where: { id: 'singleton' } });
    if (!settings?.autopilotEnabled) return { status: 'idle', reason: 'Autopilot is disabled' } as const;
    if (settings.productionPaused) return { status: 'idle', reason: 'Production is paused' } as const;

    const since = new Date(Date.now() - DAY_MS);
    const totalJobs = await tx.productionJob.count({
      where: { createdAt: { gte: since }, status: { not: JobStatus.CANCELLED } }
    });
    if (totalJobs >= settings.dailyProductionLimit) {
      return { status: 'idle', reason: `Global daily production limit reached (${settings.dailyProductionLimit})` } as const;
    }

    const [generalCount, kidsCount] = await Promise.all([
      tx.productionJob.count({ where: { origin: JobOrigin.AUTOPILOT, prompt: { channelType: ChannelType.GENERAL }, createdAt: { gte: since } } }),
      tx.productionJob.count({ where: { origin: JobOrigin.AUTOPILOT, prompt: { channelType: ChannelType.KIDS_CHANNEL_ONLY }, createdAt: { gte: since } } })
    ]);

    const needs: Array<{ channelType: ChannelType; deficit: number }> = [
      { channelType: ChannelType.GENERAL, deficit: Math.max(0, settings.autopilotGeneralDailyTarget - generalCount) }
    ];
    if (settings.autopilotKidsEnabled && settings.autopilotKidsDailyTarget > 0) {
      needs.push({ channelType: ChannelType.KIDS_CHANNEL_ONLY, deficit: Math.max(0, settings.autopilotKidsDailyTarget - kidsCount) });
    }
    needs.sort((a, b) => b.deficit - a.deficit);

    for (const need of needs) {
      if (need.deficit <= 0) continue;

      const channel = await tx.channel.findFirst({
        where: { enabled: true, type: need.channelType },
        orderBy: { createdAt: 'asc' }
      });
      if (!channel) continue;

      const candidates = await tx.prompt.findMany({
        where: { active: true, channelType: need.channelType, jobs: { none: {} } },
        select: {
          id: true,
          externalPromptId: true,
          category: true,
          concept: true,
          targetDurationSeconds: true,
          channelType: true
        },
        orderBy: { externalPromptId: 'asc' },
        take: 300
      });
      if (!candidates.length) continue;

      const [snapshots, recentJobs] = await Promise.all([
        tx.analyticsSnapshot.findMany({
          select: {
            jobId: true,
            performanceScore: true,
            job: { select: { prompt: { select: { category: true } } } }
          },
          orderBy: { capturedAt: 'desc' },
          take: 300
        }),
        tx.productionJob.findMany({
          where: { origin: JobOrigin.AUTOPILOT },
          select: { prompt: { select: { category: true } } },
          orderBy: { createdAt: 'desc' },
          take: 12
        })
      ]);

      const ranked = rankAutopilotCandidates(
        candidates,
        snapshots.map((snapshot) => ({
          jobId: snapshot.jobId,
          category: snapshot.job.prompt.category,
          score: snapshot.performanceScore
        })),
        recentJobs.map((job) => job.prompt.category)
      );
      const selected = ranked[0];
      if (!selected) continue;

      const job = await tx.productionJob.create({
        data: {
          promptId: selected.id,
          channelId: channel.id,
          status: JobStatus.QUEUED,
          origin: JobOrigin.AUTOPILOT,
          provider: process.env.VIDEO_PROVIDER || 'mock',
          requestedDuration: selected.targetDurationSeconds
        }
      });

      await tx.activityLog.create({
        data: {
          actor: 'autopilot',
          action: 'AUTOPILOT_JOB_QUEUED',
          entityType: 'ProductionJob',
          entityId: job.id,
          metadata: {
            promptId: selected.id,
            externalPromptId: selected.externalPromptId,
            category: selected.category,
            channelType: selected.channelType,
            selectionScore: selected.selectionScore,
            categoryAverage: selected.categoryAverage,
            categorySamples: selected.categorySamples
          } satisfies Prisma.InputJsonValue
        }
      });

      return {
        status: 'queued',
        jobId: job.id,
        promptId: selected.id,
        externalPromptId: selected.externalPromptId,
        category: selected.category,
        channelType: selected.channelType,
        selectionScore: selected.selectionScore
      } as const;
    }

    return { status: 'idle', reason: 'Daily autopilot targets are met, no matching channel exists, or the unused prompt bank is exhausted' } as const;
  });
}
