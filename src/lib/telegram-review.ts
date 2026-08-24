import { Markup, Telegraf } from 'telegraf';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { notificationDedupeKey } from './generation-recovery';

const REVIEW_NOTIFICATION_ACTION = 'REVIEW_TELEGRAM_NOTIFICATION_SENT';
const FAILURE_NOTIFICATION_ACTION = 'FAILURE_TELEGRAM_NOTIFICATION_SENT';
let lastSweepAt = 0;

function reviewUrlForTelegram(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
    return `${url.origin}/review`;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function alreadyNotified(jobId: string, action: string) {
  return Boolean(await prisma.activityLog.findFirst({
    where: {
      action,
      entityType: 'ProductionJob',
      entityId: jobId
    },
    select: { id: true }
  }).catch(() => null));
}

async function markNotified(jobId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.activityLog.create({
    data: {
      actor: 'worker',
      action,
      entityType: 'ProductionJob',
      entityId: jobId,
      metadata: metadata as Prisma.InputJsonValue
    }
  }).catch((error) => {
    console.error(`Could not persist Telegram review notification marker for ${jobId}: ${errorMessage(error)}`);
  });
}

export async function notifyReviewReady(input: {
  jobId: string;
  externalPromptId: string;
  concept: string;
  durationSeconds: number;
  provider: string;
  origin: string;
  creationId?: string | null;
  providerStatus?: string | null;
  generationAttempt: number;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!token || !allowedUserId) {
    console.warn('Telegram review notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID is missing.');
    return false;
  }

  const action = `${REVIEW_NOTIFICATION_ACTION}:${notificationDedupeKey('review', input.jobId, input.generationAttempt)}`;
  if (await alreadyNotified(input.jobId, action)) return true;

  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3100';
  const reviewUrl = reviewUrlForTelegram(baseUrl);
  const concept = input.concept.length <= 120 ? input.concept : `${input.concept.slice(0, 119)}…`;
  const bot = new Telegraf(token);
  const text = `🎬 Ready for review\n\n${input.externalPromptId} · ${input.durationSeconds}s\n${concept}\n\nProvider: ${input.provider}\nStatus: ${input.providerStatus || 'COMPLETED'}\nCreation: ${input.creationId || 'n/a'}\nOrigin: ${input.origin}\n\nOne tap can approve it and place it into the next smart publishing slot.${reviewUrl ? '' : '\n\nAll primary actions are available below; no localhost link is required.'}`;

  const rows = [
    [Markup.button.callback('✅ Approve + smart schedule', `approve-smart:${input.jobId}`)],
    [Markup.button.callback('Approve only', `approve:${input.jobId}`), Markup.button.callback('🔄 Regenerate', `regenerate:${input.jobId}`)],
    reviewUrl
      ? [Markup.button.callback('❌ Reject', `reject:${input.jobId}`), Markup.button.url('▶ Open review', reviewUrl)]
      : [Markup.button.callback('❌ Reject', `reject:${input.jobId}`)]
  ];

  try {
    await bot.telegram.sendMessage(
      allowedUserId,
      text,
      {
        ...Markup.inlineKeyboard(rows),
        link_preview_options: { is_disabled: true }
      }
    );
    console.info(`[JOB ${input.externalPromptId}] Telegram review notification sent`);
    await markNotified(input.jobId, action, { mode: 'interactive', generationAttempt: input.generationAttempt });
    return true;
  } catch (interactiveError) {
    console.error(`Telegram interactive review notification failed for ${input.externalPromptId}: ${errorMessage(interactiveError)}`);

    // Do not let an inline-keyboard formatting/API quirk hide a completed render.
    // Fall back to a plain text notification using the same bot/chat.
    try {
      await bot.telegram.sendMessage(
        allowedUserId,
        `🎬 Ready for review\n\n${input.externalPromptId} · ${input.durationSeconds}s\n${concept}\n\nProvider: ${input.provider}\nOrigin: ${input.origin}\n\nOpen the factory Review page to approve, regenerate, or reject it.`,
        { link_preview_options: { is_disabled: true } }
      );
      console.info(`Telegram plain-text fallback sent for ${input.externalPromptId}.`);
      await markNotified(input.jobId, action, { mode: 'plain', generationAttempt: input.generationAttempt });
      return true;
    } catch (fallbackError) {
      console.error(`Telegram plain-text fallback failed for ${input.externalPromptId}: ${errorMessage(fallbackError)}`);
      throw fallbackError;
    }
  }
}

export async function sweepReadyReviewNotifications() {
  if (Date.now() - lastSweepAt < 30_000) return 0;
  lastSweepAt = Date.now();

  const jobs = await prisma.productionJob.findMany({
    where: { status: 'READY_FOR_REVIEW' },
    include: { prompt: true },
    orderBy: { updatedAt: 'asc' },
    take: 10
  });

  let sent = 0;
  for (const job of jobs) {
    if (await alreadyNotified(job.id, `${REVIEW_NOTIFICATION_ACTION}:${notificationDedupeKey('review', job.id, job.generationAttempt)}`)) continue;
    const ok = await notifyReviewReady({
      jobId: job.id,
      externalPromptId: job.prompt.externalPromptId,
      concept: job.prompt.concept,
      durationSeconds: job.requestedDuration,
      provider: job.provider,
      origin: job.origin,
      creationId: job.creationId || job.providerJobId,
      providerStatus: job.providerStatus,
      generationAttempt: job.generationAttempt
    }).catch((error) => {
      console.error(`Telegram ready-review sweep failed for ${job.prompt.externalPromptId}: ${errorMessage(error)}`);
      return false;
    });
    if (ok) sent += 1;
  }
  return sent;
}

export async function notifyJobFailureOnce(input: { jobId: string; externalPromptId: string; generationAttempt: number; reason: string }) {
  const action = `${FAILURE_NOTIFICATION_ACTION}:${notificationDedupeKey('failure', input.jobId, input.generationAttempt)}`;
  if (await alreadyNotified(input.jobId, action)) return true;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!token || !allowedUserId) return false;
  const reason = input.reason.replace(/(?:sk-|gsk_|Bearer\s+)[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, 300);
  const bot = new Telegraf(token);
  await bot.telegram.sendMessage(allowedUserId, `⚠️ Generation failed\n\n${input.externalPromptId}\n${reason}\n\nUse /queue to inspect it. Retry only once after checking whether OpenArt already created an asset.`, { link_preview_options: { is_disabled: true } });
  await markNotified(input.jobId, action, { generationAttempt: input.generationAttempt, reason });
  return true;
}
