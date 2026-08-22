import { prisma } from './prisma';
import { getYouTubeConnectionStatus } from './youtube-auth';
import { hasDurableOpenArtOAuthCredential } from './openart-oauth';

export type ActivationState = 'PASS' | 'ACTION' | 'LOCKED' | 'WARN';
export type ActivationCheck = { id: string; label: string; state: ActivationState; detail: string; env?: string[]; href?: string; actionLabel?: string };
export type ActivationChannel = { id: string; name: string; type: 'GENERAL' | 'KIDS_CHANNEL_ONLY'; enabled: boolean; externalChannelId: string | null; oauthConfigured: boolean; oauthConnected: boolean };
export type ActivationReport = {
  generatedAt: string;
  checks: ActivationCheck[];
  channels: ActivationChannel[];
  counts: { prompts: number; generalPrompts: number; kidsPrompts: number };
  phases: { mockReady: boolean; creativeConfigured: boolean; realRenderConfigured: boolean; privateYouTubeConfigured: boolean; paidAutopilotReady: boolean; publicPublishingReady: boolean };
};

const has = (value?: string) => Boolean(value?.trim());
const secretOk = (value?: string) => Boolean(value && value.length >= 32);
function urlOk(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname));
  } catch { return false; }
}

function selectedAiProvider() {
  return process.env.AI_PROVIDER || (has(process.env.OPENAI_API_KEY) ? 'openai' : 'anthropic');
}

export async function getActivationReport(): Promise<ActivationReport> {
  let databaseReady = false;
  let prompts = 0;
  let generalPrompts = 0;
  let kidsPrompts = 0;
  let rawChannels: Array<{ id: string; name: string; type: 'GENERAL' | 'KIDS_CHANNEL_ONLY'; enabled: boolean; externalChannelId: string | null }> = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
    [prompts, generalPrompts, kidsPrompts, rawChannels] = await Promise.all([
      prisma.prompt.count({ where: { active: true } }),
      prisma.prompt.count({ where: { active: true, channelType: 'GENERAL' } }),
      prisma.prompt.count({ where: { active: true, channelType: 'KIDS_CHANNEL_ONLY' } }),
      prisma.channel.findMany({ select: { id: true, name: true, type: true, enabled: true, externalChannelId: true }, orderBy: { createdAt: 'asc' } })
    ]);
  } catch { databaseReady = false; }

  const channels: ActivationChannel[] = await Promise.all(rawChannels.map(async (channel) => {
    const oauth = await getYouTubeConnectionStatus(channel.id).catch(() => ({ configured: false, connected: false }));
    return { ...channel, oauthConfigured: oauth.configured, oauthConnected: oauth.connected };
  }));

  const appSecretOk = secretOk(process.env.APP_SECRET);
  const appBaseUrlOk = urlOk(process.env.APP_BASE_URL);
  const telegramA = has(process.env.TELEGRAM_BOT_TOKEN);
  const telegramB = has(process.env.TELEGRAM_ALLOWED_USER_ID);
  const telegramConfigured = telegramA && telegramB;
  const openAiConfigured = has(process.env.OPENAI_API_KEY);
  const anthropicConfigured = has(process.env.ANTHROPIC_API_KEY) && has(process.env.ANTHROPIC_MODEL);
  const creativeDirector = process.env.CREATIVE_DIRECTOR || 'mock';
  const aiProvider = selectedAiProvider();
  const creativeConfiguredByEnv = creativeDirector === 'openai' ? openAiConfigured : creativeDirector === 'anthropic' ? anthropicConfigured : creativeDirector === 'mock';
  const bridgeConfigured = aiProvider === 'openai' ? openAiConfigured : anthropicConfigured;
  const durableOpenArt = await hasDurableOpenArtOAuthCredential().catch(() => false);
  const openArtOAuthConfigured = durableOpenArt || has(process.env.OPENART_MCP_ACCESS_TOKEN) || has(process.env.OPENART_MCP_REFRESH_TOKEN);
  const openArtConfigured = bridgeConfigured && openArtOAuthConfigured && has(process.env.OPENART_MCP_URL);
  const youtubeClientConfigured = has(process.env.YOUTUBE_CLIENT_ID) && has(process.env.YOUTUBE_CLIENT_SECRET) && appBaseUrlOk && appSecretOk;
  const general = channels.filter((c) => c.enabled && c.type === 'GENERAL');
  const kids = channels.filter((c) => c.enabled && c.type === 'KIDS_CHANNEL_ONLY');
  const generalYouTubeReady = general.length > 0 && general.every((c) => c.oauthConnected && Boolean(c.externalChannelId));
  const kidsYouTubeReady = kids.length === 0 || kids.every((c) => c.oauthConnected && Boolean(c.externalChannelId));
  const video = process.env.VIDEO_PROVIDER || 'mock';
  const publishing = process.env.PUBLISHING_PROVIDER || 'mock';
  const paid = process.env.ALLOW_PAID_GENERATION === 'true';
  const autoPaid = process.env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true';
  const upload = process.env.ALLOW_YOUTUBE_UPLOAD === 'true';
  const publicPublish = process.env.ALLOW_PUBLIC_PUBLISHING === 'true';
  const creativeLabel = creativeDirector === 'openai' ? `OpenAI (${process.env.OPENAI_MODEL || 'gpt-5.6-terra'})` : creativeDirector === 'anthropic' ? `Claude (${process.env.ANTHROPIC_MODEL || 'model missing'})` : 'Mock';

  const checks: ActivationCheck[] = [
    { id: 'database', label: 'Database', state: databaseReady ? 'PASS' : 'ACTION', detail: databaseReady ? 'PostgreSQL is reachable.' : 'Set DATABASE_URL and initialize the database.', env: databaseReady ? undefined : ['DATABASE_URL'] },
    { id: 'app-secret', label: 'Operator secret', state: appSecretOk ? 'PASS' : 'ACTION', detail: appSecretOk ? 'APP_SECRET is strong enough.' : 'Use a random APP_SECRET of at least 32 characters.', env: appSecretOk ? undefined : ['APP_SECRET'] },
    { id: 'base-url', label: 'Factory URL', state: appBaseUrlOk ? 'PASS' : 'ACTION', detail: appBaseUrlOk ? 'APP_BASE_URL is HTTPS or loopback-only HTTP.' : 'Remote use requires HTTPS; plain HTTP is allowed only on loopback.', env: appBaseUrlOk ? undefined : ['APP_BASE_URL'] },
    { id: 'channel-general', label: 'General channel record', state: general.length ? 'PASS' : 'ACTION', detail: general.length ? `${general.length} enabled GENERAL channel record(s).` : 'Create or seed a GENERAL channel.', href: general.length ? undefined : '/settings', actionLabel: general.length ? undefined : 'Open Settings' },
    { id: 'prompt-bank', label: 'Prompt bank', state: generalPrompts ? 'PASS' : 'ACTION', detail: generalPrompts ? `${prompts} active prompts: ${generalPrompts} general, ${kidsPrompts} kids.` : 'Install the built-in 1,000-prompt bank.', href: generalPrompts ? undefined : '/prompts', actionLabel: generalPrompts ? undefined : 'Open Prompt Library' },
    { id: 'telegram', label: 'Telegram remote control', state: telegramConfigured ? 'PASS' : telegramA !== telegramB ? 'WARN' : 'ACTION', detail: telegramConfigured ? 'Bot token and allowlisted operator ID are configured.' : telegramA !== telegramB ? 'Telegram is only half configured.' : 'Configure Telegram for phone control.', env: telegramConfigured ? undefined : ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_ID'] },
    { id: 'ai-director', label: 'AI creative director', state: creativeConfiguredByEnv && creativeDirector !== 'mock' ? 'PASS' : 'ACTION', detail: creativeDirector === 'mock' ? 'Select OpenAI or Anthropic for live creative planning.' : `Configured: ${creativeLabel}.`, env: creativeConfiguredByEnv && creativeDirector !== 'mock' ? undefined : creativeDirector === 'anthropic' ? ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] : ['OPENAI_API_KEY', 'OPENAI_MODEL'] },
    { id: 'openart', label: 'OpenArt MCP video generation', state: openArtConfigured ? paid ? 'PASS' : 'LOCKED' : 'ACTION', detail: openArtConfigured ? `${aiProvider.toUpperCase()} bridge + OpenArt OAuth configured${paid ? '; paid generation unlocked.' : '; spending remains intentionally locked.'}` : 'Configure the selected AI bridge and OpenArt MCP OAuth.', env: openArtConfigured ? undefined : [aiProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY', 'OPENART_MCP_URL'] },
    { id: 'youtube-client', label: 'YouTube OAuth client', state: youtubeClientConfigured ? 'PASS' : 'ACTION', detail: youtubeClientConfigured ? 'Google OAuth client is ready.' : 'Configure the Google OAuth client.', env: youtubeClientConfigured ? undefined : ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'] },
    { id: 'youtube-general', label: 'General YouTube channel', state: generalYouTubeReady ? 'PASS' : youtubeClientConfigured && general.length ? 'ACTION' : 'LOCKED', detail: generalYouTubeReady ? 'GENERAL channel is OAuth-bound.' : youtubeClientConfigured && general.length ? 'Connect the GENERAL channel.' : 'Waiting for OAuth client/channel.', href: youtubeClientConfigured && general.length && !generalYouTubeReady ? '/settings' : undefined, actionLabel: youtubeClientConfigured && general.length && !generalYouTubeReady ? 'Connect YouTube' : undefined },
    { id: 'youtube-kids', label: 'Kids YouTube isolation', state: !kids.length ? 'LOCKED' : kidsYouTubeReady ? 'PASS' : 'ACTION', detail: !kids.length ? 'No kids channel yet; kids production stays isolated.' : kidsYouTubeReady ? 'Every kids channel has its own connection.' : 'Connect each kids channel separately.', href: kids.length && !kidsYouTubeReady ? '/settings' : undefined, actionLabel: kids.length && !kidsYouTubeReady ? 'Connect Kids Channel' : undefined },
    { id: 'upload-lock', label: 'Real YouTube upload', state: upload ? publishing === 'youtube' ? 'PASS' : 'WARN' : 'LOCKED', detail: upload ? `Upload lock open; provider=${publishing}.` : 'Keep locked until one PRIVATE upload is intentional.', env: upload ? undefined : ['PUBLISHING_PROVIDER', 'ALLOW_YOUTUBE_UPLOAD'] },
    { id: 'autopilot-spend', label: 'Paid Autopilot spending', state: autoPaid && paid ? 'PASS' : 'LOCKED', detail: autoPaid && paid ? 'Automatic paid generation is explicitly unlocked.' : 'Separate background spending lock is closed.', env: autoPaid && paid ? undefined : ['ALLOW_AUTOPILOT_PAID_GENERATION'] },
    { id: 'public-lock', label: 'Public publishing', state: publicPublish && upload && publishing === 'youtube' ? 'PASS' : 'LOCKED', detail: publicPublish ? 'Public publishing is unlocked.' : 'Leave locked through the first PRIVATE test.', env: publicPublish ? undefined : ['ALLOW_PUBLIC_PUBLISHING'] }
  ];

  const mockReady = databaseReady && appSecretOk && appBaseUrlOk && general.length > 0 && generalPrompts > 0;
  const creativeConfigured = mockReady && creativeConfiguredByEnv && creativeDirector !== 'mock';
  const realRenderConfigured = creativeConfigured && openArtConfigured && video === 'openart-mcp';
  const privateYouTubeConfigured = mockReady && youtubeClientConfigured && generalYouTubeReady && publishing === 'youtube';
  const paidAutopilotReady = realRenderConfigured && paid && autoPaid;
  const publicPublishingReady = privateYouTubeConfigured && upload && publicPublish;

  return { generatedAt: new Date().toISOString(), checks, channels, counts: { prompts, generalPrompts, kidsPrompts }, phases: { mockReady, creativeConfigured, realRenderConfigured, privateYouTubeConfigured, paidAutopilotReady, publicPublishingReady } };
}
