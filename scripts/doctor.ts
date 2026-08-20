import { prisma } from '../src/lib/prisma';
import { getYouTubeConnectionStatus } from '../src/lib/youtube-auth';
import { openArtMcpStatus } from '../src/lib/openart-mcp-provider';

type Check = { name: string; level: 'PASS' | 'WARN' | 'FAIL'; detail: string };

function check(name: string, condition: boolean, pass: string, fail: string, required = true): Check {
  return { name, level: condition ? 'PASS' : required ? 'FAIL' : 'WARN', detail: condition ? pass : fail };
}

function validUrl(value?: string) {
  if (!value) return false;
  try { new URL(value); return true; } catch { return false; }
}

async function main() {
  const checks: Check[] = [];

  checks.push(check('DATABASE_URL', Boolean(process.env.DATABASE_URL), 'configured', 'missing'));
  let databaseReady = false;
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseReady = true;
      checks.push({ name: 'Database connectivity', level: 'PASS', detail: 'reachable' });
    } catch (error) {
      checks.push({ name: 'Database connectivity', level: 'FAIL', detail: error instanceof Error ? error.message.slice(0, 140) : 'unreachable' });
    }
  }

  const appSecret = process.env.APP_SECRET ?? '';
  checks.push(check('APP_SECRET', appSecret.length >= 32, 'configured with >=32 characters', 'missing or too short'));
  checks.push(check('APP_BASE_URL', validUrl(process.env.APP_BASE_URL), process.env.APP_BASE_URL || 'configured', 'missing or invalid'));

  const telegramToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const telegramUser = Boolean(process.env.TELEGRAM_ALLOWED_USER_ID);
  checks.push({
    name: 'Telegram control',
    level: telegramToken === telegramUser ? (telegramToken ? 'PASS' : 'WARN') : 'FAIL',
    detail: telegramToken === telegramUser ? (telegramToken ? 'token + allowlisted user configured' : 'disabled') : 'configure both TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_ID together'
  });

  const creative = process.env.CREATIVE_DIRECTOR || 'mock';
  checks.push({
    name: 'Creative director',
    level: creative === 'mock' ? 'WARN' : process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? 'PASS' : 'FAIL',
    detail: creative === 'mock' ? 'mock mode' : `provider=${creative}; Anthropic key/model ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? 'present' : 'missing'}`
  });

  const videoProvider = process.env.VIDEO_PROVIDER || 'mock';
  if (videoProvider === 'openart-mcp') {
    const openart = openArtMcpStatus();
    checks.push({
      name: 'OpenArt MCP',
      level: openart.configured ? (openart.paidGenerationUnlocked ? 'PASS' : 'WARN') : 'FAIL',
      detail: openart.configured ? `configured; paid generation ${openart.paidGenerationUnlocked ? 'UNLOCKED' : 'locked'}` : 'missing Anthropic model/key or OpenArt OAuth token'
    });
  } else {
    checks.push({ name: 'Video provider', level: 'WARN', detail: `provider=${videoProvider}; no paid generation expected` });
  }

  const publishing = process.env.PUBLISHING_PROVIDER || 'mock';
  if (publishing === 'youtube') {
    const oauthClientReady = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.APP_BASE_URL);
    checks.push({
      name: 'YouTube OAuth client',
      level: oauthClientReady ? 'PASS' : 'FAIL',
      detail: oauthClientReady ? 'client credentials + callback base URL configured' : 'client credentials/base URL incomplete'
    });

    if (databaseReady) {
      const channels = await prisma.channel.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' } });
      for (const channel of channels) {
        const status = await getYouTubeConnectionStatus(channel.id).catch(() => ({ configured: false, connected: false }));
        checks.push({
          name: `YouTube · ${channel.name}`,
          level: status.connected && channel.externalChannelId ? 'PASS' : 'FAIL',
          detail: status.connected && channel.externalChannelId ? `connected as ${channel.externalChannelId}` : 'factory channel is not fully OAuth-bound'
        });
      }
    }

    checks.push({
      name: 'YouTube upload lock',
      level: process.env.ALLOW_YOUTUBE_UPLOAD === 'true' ? 'WARN' : 'PASS',
      detail: process.env.ALLOW_YOUTUBE_UPLOAD === 'true' ? 'UNLOCKED: real uploads can occur' : 'locked'
    });
    checks.push({
      name: 'Public publishing lock',
      level: process.env.ALLOW_PUBLIC_PUBLISHING === 'true' ? 'WARN' : 'PASS',
      detail: process.env.ALLOW_PUBLIC_PUBLISHING === 'true' ? 'UNLOCKED: public publishing can occur' : 'locked; private-first safety active'
    });
  } else {
    checks.push({ name: 'Publishing provider', level: 'WARN', detail: `provider=${publishing}; no real YouTube upload expected` });
  }

  console.log('\nKarzoun Media Factory Doctor\n');
  for (const item of checks) console.log(`${item.level.padEnd(4)}  ${item.name}: ${item.detail}`);

  const fail = checks.filter((item) => item.level === 'FAIL').length;
  const warn = checks.filter((item) => item.level === 'WARN').length;
  console.log(`\nSummary: ${checks.length - fail - warn} pass, ${warn} warning, ${fail} fail`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Doctor failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
