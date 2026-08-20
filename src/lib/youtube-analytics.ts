import { google } from 'googleapis';
import { prisma } from './prisma';
import { calculatePerformance } from './performance-score';
import { getAuthorizedYouTubeClient } from './youtube-auth';

const METRICS = [
  'views',
  'engagedViews',
  'likes',
  'comments',
  'shares',
  'subscribersGained',
  'subscribersLost',
  'averageViewDuration',
  'averageViewPercentage'
] as const;

type MetricName = (typeof METRICS)[number];

type AnalyticsRow = Partial<Record<MetricName, number>> & { video: string };

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numeric(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseRows(data: { columnHeaders?: Array<{ name?: string | null }> | null; rows?: unknown[][] | null }) {
  const headers = (data.columnHeaders ?? []).map((header) => header.name ?? '');
  const videoIndex = headers.indexOf('video');
  if (videoIndex < 0) return new Map<string, AnalyticsRow>();

  const result = new Map<string, AnalyticsRow>();
  for (const raw of data.rows ?? []) {
    const video = String(raw[videoIndex] ?? '');
    if (!video) continue;
    const row: AnalyticsRow = { video };
    for (const metric of METRICS) {
      const index = headers.indexOf(metric);
      if (index >= 0) row[metric] = numeric(raw[index]);
    }
    result.set(video, row);
  }
  return result;
}

async function queryAnalytics(videoIds: string[], startDate: Date, endDate: Date) {
  const auth = await getAuthorizedYouTubeClient();
  const analytics = google.youtubeAnalytics({ version: 'v2', auth });

  const query = async (metrics: string) => analytics.reports.query({
    ids: 'channel==MINE',
    startDate: yyyyMmDd(startDate),
    endDate: yyyyMmDd(endDate),
    metrics,
    dimensions: 'video',
    filters: `video==${videoIds.join(',')}`,
    maxResults: Math.min(videoIds.length, 200)
  });

  try {
    const response = await query(METRICS.join(','));
    return parseRows(response.data);
  } catch (error) {
    // engagedViews is a newer metric. Fall back rather than losing all analytics
    // if Google rejects it for an unusual account/date combination.
    const fallbackMetrics = METRICS.filter((metric) => metric !== 'engagedViews').join(',');
    const response = await query(fallbackMetrics);
    return parseRows(response.data);
  }
}

async function queryCurrentVideoStatistics(videoIds: string[]) {
  const auth = await getAuthorizedYouTubeClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const response = await youtube.videos.list({ part: ['statistics'], id: videoIds });

  return new Map((response.data.items ?? []).map((item) => [item.id ?? '', {
    views: numeric(item.statistics?.viewCount),
    likes: numeric(item.statistics?.likeCount),
    comments: numeric(item.statistics?.commentCount)
  }]));
}

export interface AnalyticsSyncSummary {
  eligible: number;
  synced: number;
  skippedFresh: number;
  failed: number;
  failures: Array<{ jobId: string; reason: string }>;
}

/**
 * Pulls analytics for videos published by this factory.
 * The public targeted YouTube Analytics API currently does not expose the
 * Studio "viewed vs swiped away" card directly, so that field remains null.
 */
export async function syncPublishedAnalytics(options?: { limit?: number; minAgeMinutes?: number; force?: boolean }): Promise<AnalyticsSyncSummary> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 200));
  const minAgeMinutes = Math.max(1, options?.minAgeMinutes ?? Number(process.env.ANALYTICS_SYNC_MINUTES || 30));
  const freshCutoff = new Date(Date.now() - minAgeMinutes * 60_000);

  const jobs = await prisma.productionJob.findMany({
    where: {
      status: 'PUBLISHED',
      publishRecord: { youtubeVideoId: { not: null } }
    },
    include: {
      prompt: true,
      publishRecord: true,
      analytics: { orderBy: { capturedAt: 'desc' }, take: 1 }
    },
    orderBy: { updatedAt: 'desc' },
    take: limit
  });

  const eligible = jobs.filter((job) => {
    if (options?.force) return true;
    const latest = job.analytics[0]?.capturedAt;
    return !latest || latest < freshCutoff;
  });

  const summary: AnalyticsSyncSummary = {
    eligible: eligible.length,
    synced: 0,
    skippedFresh: jobs.length - eligible.length,
    failed: 0,
    failures: []
  };

  if (!eligible.length) return summary;

  const videoIds = eligible.map((job) => job.publishRecord?.youtubeVideoId).filter((id): id is string => Boolean(id));
  if (!videoIds.length) return summary;

  const earliest = eligible.reduce((date, job) => {
    const published = job.publishRecord?.publishedAt ?? job.updatedAt;
    return published < date ? published : date;
  }, new Date());

  const [analyticsRows, currentStats] = await Promise.all([
    queryAnalytics(videoIds, earliest, new Date()),
    queryCurrentVideoStatistics(videoIds)
  ]);

  for (const job of eligible) {
    const videoId = job.publishRecord?.youtubeVideoId;
    if (!videoId) continue;

    try {
      const row = analyticsRows.get(videoId) ?? { video: videoId };
      const current = currentStats.get(videoId);
      const views = Math.max(numeric(row.views), current?.views ?? 0);
      const likes = Math.max(numeric(row.likes), current?.likes ?? 0);
      const comments = Math.max(numeric(row.comments), current?.comments ?? 0);
      const engagedViews = numeric(row.engagedViews);
      const shares = numeric(row.shares);
      const subscribersGained = numeric(row.subscribersGained);
      const subscribersLost = numeric(row.subscribersLost);
      const averagePercentageViewed = row.averageViewPercentage == null ? null : numeric(row.averageViewPercentage);
      const averageViewDuration = row.averageViewDuration == null ? null : numeric(row.averageViewDuration);

      const performance = calculatePerformance({
        views,
        engagedViews,
        likes,
        comments,
        shares,
        subscribersGained,
        averagePercentageViewed
      });

      const publishedAt = job.publishRecord?.publishedAt ?? job.updatedAt;
      const ageHours = Math.max(0, (Date.now() - publishedAt.getTime()) / 3_600_000);

      await prisma.analyticsSnapshot.create({
        data: {
          jobId: job.id,
          source: 'YOUTUBE_ANALYTICS',
          views,
          engagedViews,
          likes,
          comments,
          shares,
          subscribersGained,
          subscribersLost,
          averageViewDuration,
          averagePercentageViewed,
          engagedViewRate: performance.engagedViewRate,
          interactionRate: performance.interactionRate,
          subscriberConversionRate: performance.subscriberConversionRate,
          viewedVsSwipedAway: null,
          first24hPerformance: ageHours <= 24 ? performance.score : null,
          first48hPerformance: ageHours <= 48 ? performance.score : null,
          performanceScore: performance.score
        }
      });

      await prisma.activityLog.create({
        data: {
          actor: 'analytics-worker',
          action: 'ANALYTICS_SNAPSHOT_CAPTURED',
          entityType: 'ProductionJob',
          entityId: job.id,
          metadata: { videoId, views, score: performance.score, sample: performance.sampleLabel }
        }
      });
      summary.synced++;
    } catch (error) {
      summary.failed++;
      summary.failures.push({
        jobId: job.id,
        reason: error instanceof Error ? error.message.slice(0, 240) : 'Unknown analytics ingestion error'
      });
    }
  }

  return summary;
}
