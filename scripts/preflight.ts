import { prisma } from '../src/lib/prisma';
import { preflightOpenArtMcp } from '../src/lib/openart-mcp-provider';
import { evaluateRuntimeSafety, readinessSummary } from '../src/lib/runtime-readiness';
import { getYouTubeConnectionStatus } from '../src/lib/youtube-auth';

type Check = { name: string; level: 'PASS' | 'WARN' | 'FAIL'; detail: string };

async function main() {
  const checks: Check[] = [];
  const runtime = readinessSummary(evaluateRuntimeSafety(process.env));
  checks.push({ name: 'Worker configuration', level: runtime.ready ? 'PASS' : 'FAIL', detail: runtime.ready ? 'valid' : runtime.blocking.map((item) => item.name).join(', ') });

  let databaseReady = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
    checks.push({ name: 'Database', level: 'PASS', detail: 'reachable' });
  } catch (error) {
    checks.push({ name: 'Database', level: 'FAIL', detail: error instanceof Error ? error.message.slice(0, 160) : 'unreachable' });
  }

  const telegramReady = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALLOWED_USER_ID);
  checks.push({ name: 'Telegram', level: telegramReady ? 'PASS' : 'FAIL', detail: telegramReady ? 'bot token and allowlisted operator configured' : 'bot token/operator missing' });
  checks.push({ name: 'Creative director', level: 'PASS', detail: `${process.env.CREATIVE_DIRECTOR || 'mock'} preferred; deterministic local fallback available` });

  if ((process.env.VIDEO_PROVIDER || 'mock') === 'openart-mcp') {
    try {
      const result = await preflightOpenArtMcp();
      checks.push({ name: 'OpenArt OAuth + MCP initialize', level: 'PASS', detail: `${result.toolCount} tools; durable OAuth ${result.durableOAuth ? 'yes' : 'bootstrap token only'}` });
      checks.push({ name: 'OpenArt video tool', level: 'PASS', detail: result.generationTool });
      checks.push({ name: 'OpenArt compatible model', level: 'PASS', detail: `${result.model}; supported base duration ${result.actualDuration}s` });
    } catch (error) {
      checks.push({ name: 'OpenArt MCP', level: 'FAIL', detail: error instanceof Error ? error.message.slice(0, 240) : 'unavailable' });
    }
  } else checks.push({ name: 'OpenArt MCP', level: 'WARN', detail: `VIDEO_PROVIDER=${process.env.VIDEO_PROVIDER || 'mock'}` });

  if (databaseReady && (process.env.PUBLISHING_PROVIDER || 'mock') === 'youtube') {
    const channels = await prisma.channel.findMany({ where: { enabled: true }, orderBy: { type: 'asc' } });
    for (const type of ['GENERAL', 'KIDS_CHANNEL_ONLY'] as const) {
      const channel = channels.find((item) => item.type === type);
      const connection = channel ? await getYouTubeConnectionStatus(channel.id).catch(() => ({ connected: false })) : { connected: false };
      checks.push({ name: `YouTube ${type === 'GENERAL' ? 'GENERAL' : 'KIDS'}`, level: channel?.externalChannelId && connection.connected ? 'PASS' : 'FAIL', detail: channel?.externalChannelId && connection.connected ? `${channel.name} bound privately` : 'OAuth binding missing' });
    }
  } else checks.push({ name: 'YouTube bindings', level: 'WARN', detail: `PUBLISHING_PROVIDER=${process.env.PUBLISHING_PROVIDER || 'mock'}` });

  checks.push({ name: 'Public publishing', level: process.env.ALLOW_PUBLIC_PUBLISHING === 'true' ? 'WARN' : 'PASS', detail: process.env.ALLOW_PUBLIC_PUBLISHING === 'true' ? 'UNLOCKED' : 'LOCKED' });
  checks.push({ name: 'Paid autopilot', level: process.env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true' ? 'WARN' : 'PASS', detail: process.env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true' ? 'UNLOCKED' : 'LOCKED' });

  console.log('\nKarzoun Media Factory Preflight (no generation calls)\n');
  for (const item of checks) console.log(`${item.level.padEnd(4)}  ${item.name}: ${item.detail}`);
  const failures = checks.filter((item) => item.level === 'FAIL');
  console.log(`\n${failures.length ? `${failures.length} blocking failure(s)` : 'All blocking requirements passed'}. No OpenArt generation or YouTube upload was requested.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Preflight failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
