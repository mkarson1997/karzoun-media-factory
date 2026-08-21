import { ChannelType, JobStatus, Visibility } from '@prisma/client';
import { prisma } from './prisma';
import { scheduleApprovedJob, transitionJob } from './control-plane';

const MIN_LEAD_MINUTES = 45;
const MIN_SPACING_MINUTES = 90;
const HISTORY_LIMIT = 120;

type HourSample = { publishedAt: Date; score: number | null };

type Slot = { hour: number; minute: number; score: number | null; samples: number };

export type SmartPublishSuggestion = {
  publishAt: Date;
  timezone: string;
  source: 'LEARNED' | 'STARTER';
  learnedSamples: number;
  localLabel: string;
  localInput: string;
  reason: string;
};

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second')
  };
}

export function localDateTimeToUtc(local: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error('Invalid publish date or timezone');
  try { new Intl.DateTimeFormat('en', { timeZone }).format(new Date()); } catch { throw new Error('Invalid publish date or timezone'); }

  const [, ys, ms, ds, hs, mins] = match;
  const target = Date.UTC(Number(ys), Number(ms) - 1, Number(ds), Number(hs), Number(mins), 0);
  let instant = target;

  // Iteratively solve the IANA timezone offset. This also handles DST zones
  // without adding another date/time dependency.
  for (let i = 0; i < 3; i++) {
    const actual = partsInZone(new Date(instant), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    instant += target - actualAsUtc;
  }
  return new Date(instant);
}

export function dateToLocalInput(date: Date, timeZone: string) {
  const part = partsInZone(date, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${part.year}-${pad(part.month)}-${pad(part.day)}T${pad(part.hour)}:${pad(part.minute)}`;
}

function localLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
}

function fallbackSlots(channelType: ChannelType): Slot[] {
  // These are starter rotations only. They are deliberately not presented as
  // universal YouTube best times. Once enough factory data exists, learned
  // channel-specific hours replace them.
  return channelType === ChannelType.KIDS_CHANNEL_ONLY
    ? [
        { hour: 10, minute: 30, score: null, samples: 0 },
        { hour: 16, minute: 30, score: null, samples: 0 },
        { hour: 19, minute: 0, score: null, samples: 0 }
      ]
    : [
        { hour: 12, minute: 30, score: null, samples: 0 },
        { hour: 18, minute: 30, score: null, samples: 0 },
        { hour: 21, minute: 15, score: null, samples: 0 }
      ];
}

export function rankPublishingHours(samples: HourSample[], timeZone: string, channelType: ChannelType) {
  const buckets = new Map<number, { total: number; count: number }>();
  let usable = 0;
  for (const sample of samples) {
    if (sample.score == null || !Number.isFinite(sample.score)) continue;
    usable++;
    const hour = partsInZone(sample.publishedAt, timeZone).hour;
    const current = buckets.get(hour) ?? { total: 0, count: 0 };
    current.total += sample.score;
    current.count += 1;
    buckets.set(hour, current);
  }

  if (usable < 6) return { source: 'STARTER' as const, learnedSamples: usable, slots: fallbackSlots(channelType) };

  const learned = [...buckets.entries()]
    .filter(([, stat]) => stat.count >= 2)
    .map(([hour, stat]) => ({
      hour,
      minute: 15,
      score: Math.round((stat.total / stat.count) * 10) / 10,
      samples: stat.count
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.samples - a.samples)
    .slice(0, 3);

  if (!learned.length) return { source: 'STARTER' as const, learnedSamples: usable, slots: fallbackSlots(channelType) };
  return { source: 'LEARNED' as const, learnedSamples: usable, slots: learned };
}

function calendarDay(base: { year: number; month: number; day: number }, offset: number) {
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + offset, 12, 0, 0));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function localString(day: { year: number; month: number; day: number }, slot: Slot) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day.year}-${pad(day.month)}-${pad(day.day)}T${pad(slot.hour)}:${pad(slot.minute)}`;
}

function collides(candidate: Date, scheduled: Date[]) {
  const spacing = MIN_SPACING_MINUTES * 60_000;
  return scheduled.some((date) => Math.abs(date.getTime() - candidate.getTime()) < spacing);
}

async function historyFor(channelType: ChannelType) {
  const jobs = await prisma.productionJob.findMany({
    where: { status: JobStatus.PUBLISHED, prompt: { channelType } },
    select: {
      publishRecord: { select: { publishedAt: true } },
      analytics: {
        select: { performanceScore: true },
        orderBy: { capturedAt: 'desc' },
        take: 1
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: HISTORY_LIMIT
  });

  return jobs
    .filter((job) => Boolean(job.publishRecord?.publishedAt))
    .map((job) => ({ publishedAt: job.publishRecord!.publishedAt!, score: job.analytics[0]?.performanceScore ?? null }));
}

export async function getSmartPublishSuggestion(jobId: string, now = new Date()): Promise<SmartPublishSuggestion> {
  const [job, settings, futureSchedules] = await Promise.all([
    prisma.productionJob.findUnique({
      where: { id: jobId },
      include: { prompt: true, channel: true }
    }),
    prisma.appSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } }),
    prisma.publishSchedule.findMany({
      where: { publishAt: { gte: new Date(now.getTime() - MIN_SPACING_MINUTES * 60_000) }, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] } },
      select: { publishAt: true },
      orderBy: { publishAt: 'asc' },
      take: 100
    })
  ]);
  if (!job) throw new Error('Production job not found');

  const timezone = settings.timezone || 'Europe/Istanbul';
  let history: HourSample[] = [];
  try { history = await historyFor(job.prompt.channelType); } catch { history = []; }
  const profile = rankPublishingHours(history, timezone, job.prompt.channelType);
  const scheduled = futureSchedules.map((item) => item.publishAt);
  const localNow = partsInZone(now, timezone);
  const earliest = now.getTime() + MIN_LEAD_MINUTES * 60_000;

  for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
    const day = calendarDay(localNow, dayOffset);
    for (const slot of profile.slots) {
      const candidate = localDateTimeToUtc(localString(day, slot), timezone);
      if (candidate.getTime() < earliest) continue;
      if (collides(candidate, scheduled)) continue;

      const sourceText = profile.source === 'LEARNED'
        ? `Learned from ${profile.learnedSamples} scored factory publications. ${String(slot.hour).padStart(2, '0')}:00 local is currently one of this channel type's stronger observed hours.`
        : `Starter rotation because only ${profile.learnedSamples} scored publications are available. The factory will replace this with its own learned hours after enough analytics accumulate.`;
      return {
        publishAt: candidate,
        timezone,
        source: profile.source,
        learnedSamples: profile.learnedSamples,
        localLabel: localLabel(candidate, timezone),
        localInput: dateToLocalInput(candidate, timezone),
        reason: sourceText
      };
    }
  }

  const fallback = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    publishAt: fallback,
    timezone,
    source: 'STARTER',
    learnedSamples: profile.learnedSamples,
    localLabel: localLabel(fallback, timezone),
    localInput: dateToLocalInput(fallback, timezone),
    reason: 'No collision-free preferred slot was available in the next 10 days, so a safe fallback 24 hours ahead was selected.'
  };
}

export async function approveAndSmartSchedule(jobId: string, options?: { actor?: string; source?: 'DASHBOARD' | 'TELEGRAM' }) {
  const actor = options?.actor ?? 'smart-scheduler';
  const current = await prisma.productionJob.findUnique({ where: { id: jobId }, include: { channel: true } });
  if (!current) throw new Error('Production job not found');
  if (current.status !== JobStatus.READY_FOR_REVIEW && current.status !== JobStatus.APPROVED) {
    throw new Error('Smart scheduling requires a review-ready or approved job');
  }

  // Compute before approval so obvious planning errors do not consume the review
  // transition. The normal schedule lock still provides the final concurrency gate.
  const suggestion = await getSmartPublishSuggestion(jobId);
  if (current.status === JobStatus.READY_FOR_REVIEW) {
    await transitionJob(jobId, 'APPROVED', { actor, source: options?.source });
  }

  let visibility = current.channel.defaultVisibility;
  if (process.env.ALLOW_YOUTUBE_UPLOAD !== 'true') visibility = Visibility.PRIVATE;
  if (visibility === Visibility.PUBLIC && process.env.ALLOW_PUBLIC_PUBLISHING !== 'true') visibility = Visibility.PRIVATE;

  const refreshed = await prisma.productionJob.findUnique({ where: { id: jobId } });
  if (!refreshed) throw new Error('Production job not found');
  await scheduleApprovedJob(jobId, {
    publishAt: suggestion.publishAt,
    timezone: suggestion.timezone,
    visibility,
    title: refreshed.title ?? undefined,
    description: refreshed.description ?? undefined,
    hashtags: refreshed.hashtags
  }, actor);

  await prisma.activityLog.create({
    data: {
      actor,
      action: 'SMART_SCHEDULE_APPLIED',
      entityType: 'ProductionJob',
      entityId: jobId,
      metadata: {
        publishAt: suggestion.publishAt.toISOString(),
        timezone: suggestion.timezone,
        source: suggestion.source,
        learnedSamples: suggestion.learnedSamples,
        visibility
      }
    }
  });

  return { ...suggestion, visibility };
}
