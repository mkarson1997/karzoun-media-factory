import { createTelegramBot } from './lib/telegram';

async function main() {
  const bot = createTelegramBot();

  if (!bot) {
    console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_USER_ID missing.');
    return;
  }

  await bot.launch();
  console.log('Karzoun Media Factory Telegram worker started.');

  const shutdown = (signal: string) => {
    bot.stop(signal);
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Worker failed:', error instanceof Error ? error.message : 'unknown error');
  process.exit(1);
});
