import { Telegraf, Markup } from 'telegraf';

function assertAuthorized(ctx: any, allowedUserId: string) {
  const id = String(ctx.from?.id ?? '');
  if (id !== allowedUserId) {
    throw new Error('Unauthorized Telegram user');
  }
}

export function createTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';

  if (!token || !allowedUserId) return null;

  const bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    try {
      assertAuthorized(ctx, allowedUserId);
      await next();
    } catch {
      if (ctx.chat) await ctx.reply('Access denied.');
    }
  });

  bot.start(async (ctx) => {
    await ctx.reply(
      'Karzoun Media Factory is online.\n\nCommands: /status /queue /review /help',
      Markup.inlineKeyboard([[Markup.button.url('Open Dashboard', `${baseUrl}/dashboard`)]])
    );
  });

  bot.command('status', async (ctx) => {
    await ctx.reply('Factory status\nQueued: 0\nGenerating: 0\nReady for review: 0\nApproved: 0\nScheduled: 0\nFailed: 0');
  });

  bot.command('queue', async (ctx) => {
    await ctx.reply('No queued jobs yet.');
  });

  bot.command('review', async (ctx) => {
    await ctx.reply(
      'No jobs waiting for review.',
      Markup.inlineKeyboard([[Markup.button.url('Open Review', `${baseUrl}/review`)]])
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply('/status — factory counters\n/queue — latest jobs\n/review — review queue\n/help — commands');
  });

  return bot;
}
