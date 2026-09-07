import { prisma } from './prisma';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function evaluatePublishingWindow(input: { limit: number; publishedAt: Date[]; now?: Date }) {
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - WINDOW_MS;
  const recent = input.publishedAt
    .filter((date) => date.getTime() >= cutoff && date.getTime() <= now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  const allowed = recent.length < input.limit;
  const oldest = recent[0];
  const nextAllowedAt = allowed || !oldest ? null : new Date(oldest.getTime() + WINDOW_MS + 1000);
  return { allowed, used: recent.length, limit: input.limit, nextAllowedAt };
}

export async function assertRuntimePublishingCapacity(now = new Date()) {
  const settings = await prisma.appSettings.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });
  const since = new Date(now.getTime() - WINDOW_MS);
  const records = await prisma.publishRecord.findMany({
    where: { publishedAt: { gte: since, lte: now }, status: { not: 'FAILED' } },
    select: { publishedAt: true },
    orderBy: { publishedAt: 'asc' }
  });
  const window = evaluatePublishingWindow({
    limit: settings.dailyPublishingLimit,
    publishedAt: records.flatMap((record) => record.publishedAt ? [record.publishedAt] : []),
    now
  });

  if (!window.allowed) {
    const retry = window.nextAllowedAt?.toISOString() ?? 'later';
    throw new Error(`Daily publishing runtime limit reached (${window.limit}); retry after ${retry}`);
  }
  return window;
}
