import { Markup, Telegraf } from 'telegraf';

export async function notifyReviewReady(input: {
  jobId: string;
  externalPromptId: string;
  concept: string;
  durationSeconds: number;
  provider: string;
  origin: string;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  if (!token || !allowedUserId) return false;

  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3100';
  const concept = input.concept.length <= 120 ? input.concept : `${input.concept.slice(0, 119)}…`;
  const bot = new Telegraf(token);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Approve + smart schedule', `approve-smart:${input.jobId}`)],
    [Markup.button.callback('Approve only', `approve:${input.jobId}`), Markup.button.callback('🔄 Regenerate', `regenerate:${input.jobId}`)],
    [Markup.button.callback('❌ Reject', `reject:${input.jobId}`), Markup.button.url('▶ Open review', `${baseUrl}/review`)]
  ]);

  await bot.telegram.sendMessage(
    allowedUserId,
    `🎬 Ready for review\n\n${input.externalPromptId} · ${input.durationSeconds}s\n${concept}\n\nProvider: ${input.provider}\nOrigin: ${input.origin}\n\nOne tap can approve it and place it into the next smart publishing slot.`,
    { ...keyboard, link_preview_options: { is_disabled: true } }
  );
  return true;
}
