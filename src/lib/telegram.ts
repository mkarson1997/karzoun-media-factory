import { Markup, Telegraf, type Context } from 'telegraf';
import { getAutopilotStatus, runAutopilotTick, setAutopilotEnabled } from './autopilot';
import { getFactoryCounters, listJobs, requestRegeneration, transitionJob } from './control-plane';
import { approveAndSmartSchedule, getSmartPublishSuggestion } from './smart-scheduler';
import { prisma } from './prisma';

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

function compact(value: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

async function setFactoryPause(productionPaused: boolean, publishingPaused: boolean, actor: string) {
  const settings = await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', productionPaused, publishingPaused },
    update: { productionPaused, publishingPaused }
  });
  await prisma.activityLog.create({
    data: {
      actor,
      action: 'FACTORY_PAUSE_STATE_CHANGED',
      entityType: 'AppSettings',
      entityId: settings.id,
      metadata: { productionPaused, publishingPaused }
    }
  });
  return settings;
}

function autopilotText(status: Awaited<ReturnType<typeof getAutopilotStatus>>) {
  const mode = status.enabled ? 'ARMED' : 'OFF';
  const kids = status.kidsEnabled ? `${status.rolling24h.kidsQueued}/${status.rolling24h.kidsTarget}` : 'OFF';
  const safety = status.safetyBlock ? `\n⚠️ ${status.safetyBlock}` : '';
  return `🤖 Autopilot: ${mode}\nGeneral: ${status.rolling24h.generalQueued}/${status.rolling24h.generalTarget} in rolling 24h\nKids: ${kids}\nGlobal jobs: ${status.rolling24h.totalJobs}/${status.rolling24h.globalLimit}\nUnused prompts: ${status.unused.general} general · ${status.unused.kids} kids${safety}\n\nAutopilot chooses unused ideas and learns from category performance. Every generated video still waits for your review.`;
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
      '🏭 Karzoun Media Factory is online.\n\n/status — factory counters\n/autopilot — automatic idea production\n/queue — latest jobs\n/review — videos waiting for review\n/schedule — next smart publish suggestion\n/analytics — latest performance\n/pause — stop generation + publishing\n/resume — resume factory\n/help — commands',
      Markup.inlineKeyboard([[Markup.button.url('Open Dashboard', `${baseUrl}/dashboard`)]])
    );
  });

  bot.command('status', async (ctx) => {
    try {
      const [c, settings, autopilot] = await Promise.all([
        getFactoryCounters(),
        prisma.appSettings.findUnique({ where: { id: 'singleton' } }),
        getAutopilotStatus()
      ]);
      const production = settings?.productionPaused ? 'PAUSED' : 'RUNNING';
      const publishing = settings?.publishingPaused ? 'PAUSED' : 'RUNNING';
      await ctx.reply(`🏭 Factory status\n\nProduction: ${production}\nPublishing: ${publishing}\nAutopilot: ${autopilot.enabled ? 'ARMED' : 'OFF'}\n\nQueued: ${c.QUEUED}\nGenerating: ${c.GENERATING}\nReady for review: ${c.READY_FOR_REVIEW}\nApproved: ${c.APPROVED}\nScheduled: ${c.SCHEDULED}\nPublished: ${c.PUBLISHED}\nFailed: ${c.FAILED}`);
    } catch {
      await ctx.reply('Database is not ready yet.');
    }
  });

  bot.command('autopilot', async (ctx) => {
    try {
      const status = await getAutopilotStatus();
      await ctx.reply(
        autopilotText(status),
        Markup.inlineKeyboard([
          status.enabled
            ? [Markup.button.callback('⏹ Disable autopilot', 'autopilot:disable')]
            : [Markup.button.callback('🤖 Enable general autopilot', 'autopilot:enable')],
          [Markup.button.callback('⚡ Queue next safe idea', 'autopilot:tick'), Markup.button.url('Autopilot settings', `${baseUrl}/settings`)]
        ])
      );
    } catch {
      await ctx.reply('Could not read autopilot status.');
    }
  });

  bot.command('pause', async (ctx) => {
    try {
      await setFactoryPause(true, true, `telegram:${allowedUserId}`);
      await ctx.reply('⏸ Factory paused. No new generation or publishing will start. Analytics can still refresh.', Markup.inlineKeyboard([[Markup.button.url('Open Settings', `${baseUrl}/settings`)]]));
    } catch {
      await ctx.reply('Could not pause the factory.');
    }
  });

  bot.command('resume', async (ctx) => {
    try {
      await setFactoryPause(false, false, `telegram:${allowedUserId}`);
      await ctx.reply('▶️ Factory resumed. Production and publishing workers may continue.');
    } catch {
      await ctx.reply('Could not resume the factory.');
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
          `🎬 ${job.prompt.externalPromptId} · ${job.requestedDuration}s\n${shortConcept(job.prompt.concept)}\nProvider: ${job.provider}\nOrigin: ${job.origin}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Approve + smart schedule', `approve-smart:${job.id}`)],
            [Markup.button.callback('Approve only', `approve:${job.id}`), Markup.button.callback('🔄 Regenerate', `regenerate:${job.id}`)],
            [Markup.button.callback('❌ Reject', `reject:${job.id}`), Markup.button.url('Open Review', `${baseUrl}/review`)]
          ])
        );
      }
    } catch {
      await ctx.reply('Could not load review jobs.');
    }
  });

  bot.command('schedule', async (ctx) => {
    try {
      const jobs = await listJobs({ status: 'APPROVED', take: 5 });
      if (!jobs.length) {
        await ctx.reply('No approved videos are waiting for scheduling.', Markup.inlineKeyboard([[Markup.button.url('Open Review', `${baseUrl}/review`)]]));
        return;
      }
      const job = jobs[0];
      const suggestion = await getSmartPublishSuggestion(job.id);
      await ctx.reply(
        `🗓 Smart publish suggestion\n\n${job.prompt.externalPromptId}\n${shortConcept(job.prompt.concept, 80)}\n\nTime: ${suggestion.localLabel}\nTimezone: ${suggestion.timezone}\nSource: ${suggestion.source}\n\n${suggestion.reason}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Schedule this slot', `schedule-smart:${job.id}`)],
          [Markup.button.url('Open Schedule', `${baseUrl}/schedule?job=${job.id}`)]
        ])
      );
    } catch {
      await ctx.reply('Could not calculate a smart publishing slot.');
    }
  });

  bot.command('analytics', async (ctx) => {
    try {
      const snapshots = await prisma.analyticsSnapshot.findMany({
        include: { job: { include: { prompt: true } } },
        orderBy: { capturedAt: 'desc' },
        take: 100
      });
      const latest = new Map<string, (typeof snapshots)[number]>();
      for (const item of snapshots) if (!latest.has(item.jobId)) latest.set(item.jobId, item);
      const videos = [...latest.values()];
      if (!videos.length) {
        await ctx.reply('📊 No real YouTube analytics yet.', Markup.inlineKeyboard([[Markup.button.url('Open Analytics', `${baseUrl}/analytics`)]]));
        return;
      }

      const totalViews = videos.reduce((sum, item) => sum + item.views, 0);
      const totalSubs = videos.reduce((sum, item) => sum + item.subscribersGained, 0);
      const winners = videos.sort((a, b) => (b.performanceScore ?? 0) - (a.performanceScore ?? 0)).slice(0, 3);
      const winnerText = winners.map((item, index) => `${index + 1}. ${item.job.prompt.externalPromptId} · ${item.performanceScore?.toFixed(1) ?? '—'} score · ${compact(item.views)} views`).join('\n');
      await ctx.reply(
        `📊 Factory analytics\n\nVideos tracked: ${videos.length}\nViews: ${compact(totalViews)}\nSubscribers gained: ${compact(totalSubs)}\n\nTop performers\n${winnerText}`,
        Markup.inlineKeyboard([[Markup.button.url('Open Analytics', `${baseUrl}/analytics`)]])
      );
    } catch {
      await ctx.reply('Could not load analytics.');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply('/status — factory counters and pause state\n/autopilot — automatic idea selection and production\n/queue — latest jobs\n/review — one-tap approve + smart schedule, approve only, regenerate or reject\n/schedule — next recommended publish slot\n/analytics — latest performance\n/pause — pause generation + publishing\n/resume — resume factory\n/help — commands');
  });

  bot.action('autopilot:enable', async (ctx) => {
    try {
      await setAutopilotEnabled(true, `telegram:${allowedUserId}`);
      const result = await runAutopilotTick();
      await ctx.answerCbQuery('Autopilot enabled');
      if (result.status === 'queued') {
        await ctx.reply(`🤖 Autopilot enabled and queued ${result.externalPromptId} (${result.category}). It will still stop at review.`);
      } else {
        await ctx.reply(`🤖 Autopilot enabled. ${result.reason}`);
      }
    } catch {
      await ctx.answerCbQuery('Could not enable autopilot', { show_alert: true });
    }
  });

  bot.action('autopilot:disable', async (ctx) => {
    try {
      await setAutopilotEnabled(false, `telegram:${allowedUserId}`);
      await ctx.answerCbQuery('Autopilot disabled');
      await ctx.reply('⏹ Autopilot disabled. Existing queued/review jobs are kept.');
    } catch {
      await ctx.answerCbQuery('Could not disable autopilot', { show_alert: true });
    }
  });

  bot.action('autopilot:tick', async (ctx) => {
    try {
      const result = await runAutopilotTick();
      await ctx.answerCbQuery(result.status === 'queued' ? 'Queued' : 'No job queued');
      if (result.status === 'queued') {
        await ctx.reply(`⚡ Queued ${result.externalPromptId}\n${result.category} · ${result.channelType}\nSelection score: ${result.selectionScore}`);
      } else {
        await ctx.reply(`Autopilot: ${result.reason}`);
      }
    } catch {
      await ctx.answerCbQuery('Autopilot tick failed', { show_alert: true });
    }
  });

  bot.action(/^approve-smart:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      const suggestion = await approveAndSmartSchedule(id, { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Approved + scheduled');
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(`✅ Approved and smart-scheduled.\n\n${suggestion.localLabel}\n${suggestion.timezone}\nVisibility: ${suggestion.visibility}\nSource: ${suggestion.source}\n\n${suggestion.reason}`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 180) : 'Smart approval failed', { show_alert: true });
    }
  });

  bot.action(/^schedule-smart:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      const suggestion = await approveAndSmartSchedule(id, { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Scheduled');
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(`🗓 Scheduled for ${suggestion.localLabel} (${suggestion.timezone}) as ${suggestion.visibility}.`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 180) : 'Scheduling failed', { show_alert: true });
    }
  });

  bot.action(/^approve:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      await transitionJob(id, 'APPROVED', { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Approved');
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(`✅ Job ${id} approved. Use /schedule for the recommended slot.`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 180) : 'Approval failed', { show_alert: true });
    }
  });

  bot.action(/^regenerate:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      await requestRegeneration(id, { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Queued for regeneration');
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(`🔄 Job ${id} queued for regeneration.`);
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message.slice(0, 180) : 'Regeneration failed', { show_alert: true });
    }
  });

  bot.action(/^reject:(.+)$/, async (ctx) => {
    try {
      const id = ctx.match[1];
      await transitionJob(id, 'REJECTED', { actor: `telegram:${allowedUserId}`, source: 'TELEGRAM' });
      await ctx.answerCbQuery('Rejected');
      await ctx.editMessageReplyMarkup(undefined);
      await ctx.reply(`❌ Job ${id} rejected.`);
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
