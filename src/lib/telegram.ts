import { Markup, Telegraf, type Context } from 'telegraf';
import { getFactoryCounters, listJobs, transitionJob } from './control-plane';

function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID;
  const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return { token, allowedUserId, baseUrl };
}

function isAuthorized(ctx: Context, allowedUserId: string) {
  return String(ctx.from?.id ?? '') === allowedUserId;
}

function shortConcept(value: string, max = 100) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export async function notifyOperator(text: string) {
  const { token, allowedUserId } = telegramConfig();
  if (!token || !allowedUserId) return false;
  const bot = new Telegraf(token);
  await bot.telegram.sendMessage(allowedUserId, text, { link_preview_options: { is_disabled: true } });
  return true;
}

export function createTelegramBot() {
  const { token, allowedUserId, baseUrl } = telegramConfig();
  if (!token || !allowedUserId) return null;

  const bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    if (!isAuthorized(ctx, allowedUserId)) {
      if (ctx.chat) await ctx.reply('Access denied.');
      return;
    }
    await next();
  });

  bot.start(async (ctx) => {
    await ctx.reply(
      '🏭 Karzoun Media Factory is online.\n\n/status — factory counters\n/queue — latest jobs\n/review — videos waiting for review\n/help — commands',
      Markup.inlineKeyboard([[Markup.button.url('Open Dashboard', `${baseUrl}/dashboard`)]])
    );
  });

  bot.command('status', async (ctx) => {
    try {
      const c = await getFactoryCounters();
      await ctx.reply(`🏭 Factory status\n\nQueued: ${c.QUEUED}\nGenerating: ${c.GENERATING}\nReady for review: ${c.READY_FOR_REVIEW}\nApproved: ${c.APPROVED}\nScheduled: ${c.SCHEDULED}\nPublished: ${c.PUBLISHED}\nFailed: ${c.FAILED}`);
    } catch {
      await ctx.reply('Database is not ready yet.');
    }
  });

  bot.command('queue', async (ctx) => {
    try {
      const jobs = await listJobs({ take: 5 });
      if (!jobs.length) return void await ctx.reply('Queue is empty.');
      const text = jobs.map((job) => `${job.status} · ${job.prompt.externalPromptId}\n${shortConcept(job.prompt.concept, 80)}`).join('\n\n');
      await ctx.reply(text, Markup.inlineKeyboard([[Markup.button.url('Open Queue', `${baseUrl}/queue`)]]));
    } catch {
      await ctx.reply('Could not read the queue.');
    }
  });

  bot.command('review', async (ctx) => {
    try {
      const jobs = await listJobs({ status: 'READY_FOR_REVIEW', take: 5 });
      if (!jobs.length) return void await ctx.reply('Nothing is waiting for review.');
      for (const job of jobs) {
        await ctx.reply(
          `🎬 ${job.prompt.externalPromptId} · ${job.requestedDuration}s\n${shortConcept(job.prompt.concept)}\nProvider: ${job.provider}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Approve', `approve:${job.id}`), Markup.button.callback('❌ Reject', `reject:${job.id}`)],
            [Markup.button.url('Open Review', `${baseUrl}/review`)]
          ])
        );
      }
    } catch {
      await ctx.reply('Could not load review jobs.');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply('/status — factory counters\n/queue — latest jobs\n/review — review and approve\n/help — commands');
  });

  bot.action(/^approve:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      await transitionJob(id, 'APPROVED', { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Approved');
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(`✅ Job ${id} approved.`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 180) : 'Approval failed', { show_alert: true });
    }
  });

  bot.action(/^reject:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      await transitionJob(id, 'REJECTED', { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Rejected');
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(`❌ Job ${id} rejected. Use the dashboard or queue to regenerate it.`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 180) : 'Rejection failed', { show_alert: true });
    }
  });

  bot.action(/^retry:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      await transitionJob(id, 'QUEUED', { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Queued again');
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 180) : 'Retry failed', { show_alert: true });
    }
  });

  bot.catch(async (error, ctx) => {
    console.error('Telegram handler error:', error instanceof Error ? error.message : 'unknown error');
    if (ctx.chat) await ctx.reply('The factory hit an error. Check the dashboard.').catch(() => undefined);
  });

  return bot;
}
