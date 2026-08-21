import { prisma } from './prisma';
import { getYouTubeConnectionStatus } from './youtube-auth';

export type ActivationState = 'PASS' | 'ACTION' | 'LOCKED' | 'WARN';

export type ActivationCheck = {
  id: string;
  label: string;
  state: ActivationState;
  detail: string;
  env?: string[];
  href?: string;
  actionLabel?: string;
};

export type ActivationChannel = {
  id: string;
  name: string;
  type: 'GENERAL' | 'KIDS_CHANNEL_ONLY';
  enabled: boolean;
  externalChannelId: string | null;
  oauthConfigured: boolean;
  oauthConnected: boolean;
};

export type ActivationReport = {
  generatedAt: string;
  checks: ActivationCheck[];
  channels: ActivationChannel[];
  counts: {
    prompts: number;
    generalPrompts: number;
    kidsPrompts: number;
  };
  phases: {
    mockReady: boolean;
    creativeConfigured: boolean;
    realRenderConfigured: boolean;
    privateYouTubeConfigured: boolean;
    paidAutopilotReady: boolean;
    publicPublishingReady: boolean;
  };
};

function configured(value: string | undefined) {
  return Boolean(value && value.trim());
}

function strongSecret(value: string | undefined) {
  return Boolean(value && value.length >= 32);
}

function baseUrlReady(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (process.env.NODE_ENV === 'production') return url.protocol === 'https:';
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function getActivationReport(): Promise<ActivationReport> {
  let databaseReady = false;
  let prompts = 0;
  let generalPrompts = 0;
  let kidsPrompts = 0;
  let rawChannels: Array<{
    id: string;
    name: string;
    type: 'GENERAL' | 'KIDS_CHANNEL_ONLY';
    enabled: boolean;
    externalChannelId: string | null;
  }> = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
    [prompts, generalPrompts, kidsPrompts, rawChannels] = await Promise.all([
      prisma.prompt.count({ where: { active: true } }),
      prisma.prompt.count({ where: { active: true, channelType: 'GENERAL' } }),
      prisma.prompt.count({ where: { active: true, channelType: 'KIDS_CHANNEL_ONLY' } }),
      prisma.channel.findMany({
        select: { id: true, name: true, type: true, enabled: true, externalChannelId: true },
        orderBy: { createdAt: 'asc' }
      })
    ]);
  } catch {
    databaseReady = false;
  }

  const channels: ActivationChannel[] = await Promise.all(rawChannels.map(async (channel) => {
    const oauth = await getYouTubeConnectionStatus(channel.id).catch(() => ({ configured: false, connected: false }));
    return {
      ...channel,
      oauthConfigured: oauth.configured,
      oauthConnected: oauth.connected
    };
  }));

  const appSecretOk = strongSecret(process.env.APP_SECRET);
  const appBaseUrlOk = baseUrlReady(process.env.APP_BASE_URL);
  const telegramConfigured = configured(process.env.TELEGRAM_BOT_TOKEN) && configured(process.env.TELEGRAM_ALLOWED_USER_ID);
  const telegramHalfConfigured = configured(process.env.TELEGRAM_BOT_TOKEN) !== configured(process.env.TELEGRAM_ALLOWED_USER_ID);
  const anthropicConfigured = configured(process.env.ANTHROPIC_API_KEY) && configured(process.env.ANTHROPIC_MODEL);
  const openArtConfigured = anthropicConfigured && configured(process.env.OPENART_MCP_ACCESS_TOKEN) && configured(process.env.OPENART_MCP_URL);
  const youtubeClientConfigured = configured(process.env.YOUTUBE_CLIENT_ID) && configured(process.env.YOUTUBE_CLIENT_SECRET) && appBaseUrlOk && appSecretOk;
  const enabledGeneral = channels.filter((channel) => channel.enabled && channel.type === 'GENERAL');
  const enabledKids = channels.filter((channel) => channel.enabled && channel.type === 'KIDS_CHANNEL_ONLY');
  const generalYouTubeReady = enabledGeneral.length > 0 && enabledGeneral.every((channel) => channel.oauthConnected && Boolean(channel.externalChannelId));
  const kidsYouTubeReady = enabledKids.length === 0 || enabledKids.every((channel) => channel.oauthConnected && Boolean(channel.externalChannelId));
  const promptsReady = generalPrompts > 0;

  const videoProvider = process.env.VIDEO_PROVIDER || 'mock';
  const publishingProvider = process.env.PUBLISHING_PROVIDER || 'mock';
  const paidGenerationUnlocked = process.env.ALLOW_PAID_GENERATION === 'true';
  const autopilotPaidUnlocked = process.env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true';
  const uploadUnlocked = process.env.ALLOW_YOUTUBE_UPLOAD === 'true';
  const publicUnlocked = process.env.ALLOW_PUBLIC_PUBLISHING === 'true';

  const checks: ActivationCheck[] = [
    {
      id: 'database',
      label: 'Database',
      state: databaseReady ? 'PASS' : 'ACTION',
      detail: databaseReady ? 'PostgreSQL is reachable.' : 'Set DATABASE_URL and initialize the database.',
      env: databaseReady ? undefined : ['DATABASE_URL']
    },
    {
      id: 'app-secret',
      label: 'Operator secret',
      state: appSecretOk ? 'PASS' : 'ACTION',
      detail: appSecretOk ? 'APP_SECRET is configured with production-safe length.' : 'Set APP_SECRET to a random value of at least 32 characters.',
      env: appSecretOk ? undefined : ['APP_SECRET']
    },
    {
      id: 'base-url',
      label: 'Factory URL',
      state: appBaseUrlOk ? 'PASS' : 'ACTION',
      detail: appBaseUrlOk ? `APP_BASE_URL is configured${process.env.NODE_ENV === 'production' ? ' with HTTPS' : ''}.` : 'Set a valid APP_BASE_URL. Production requires HTTPS.',
      env: appBaseUrlOk ? undefined : ['APP_BASE_URL']
    },
    {
      id: 'channel-general',
      label: 'General channel record',
      state: enabledGeneral.length > 0 ? 'PASS' : 'ACTION',
      detail: enabledGeneral.length > 0 ? `${enabledGeneral.length} enabled GENERAL channel record(s).` : 'Create or seed the GENERAL channel before production.',
      href: enabledGeneral.length > 0 ? undefined : '/settings',
      actionLabel: enabledGeneral.length > 0 ? undefined : 'Open Settings'
    },
    {
      id: 'prompt-bank',
      label: 'Prompt bank',
      state: promptsReady ? 'PASS' : 'ACTION',
      detail: promptsReady ? `${prompts} active prompts installed: ${generalPrompts} general, ${kidsPrompts} kids.` : 'Install the built-in 1,000-prompt bank.',
      href: promptsReady ? undefined : '/prompts',
      actionLabel: promptsReady ? undefined : 'Open Prompt Library'
    },
    {
      id: 'telegram',
      label: 'Telegram remote control',
      state: telegramConfigured ? 'PASS' : telegramHalfConfigured ? 'WARN' : 'ACTION',
      detail: telegramConfigured ? 'Bot token and allowlisted operator ID are configured.' : telegramHalfConfigured ? 'Telegram is only half configured. Provide both values together.' : 'Configure Telegram for mobile control and alerts.',
      env: telegramConfigured ? undefined : ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_ALLOWED_USER_ID']
    },
    {
      id: 'claude',
      label: 'Claude creative director',
      state: anthropicConfigured ? 'PASS' : 'ACTION',
      detail: anthropicConfigured ? `Claude configuration is present (${process.env.ANTHROPIC_MODEL}).` : 'Add the Anthropic key and model before enabling the real creative director.',
      env: anthropicConfigured ? undefined : ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL']
    },
    {
      id: 'openart',
      label: 'OpenArt MCP video generation',
      state: openArtConfigured ? (paidGenerationUnlocked ? 'PASS' : 'LOCKED') : 'ACTION',
      detail: !openArtConfigured ? 'Configure Claude + OpenArt MCP OAuth first.' : paidGenerationUnlocked ? 'Configured and paid generation is unlocked.' : 'Configured, but spending is intentionally locked until the first real render.',
      env: openArtConfigured ? undefined : ['OPENART_MCP_ACCESS_TOKEN', 'OPENART_MCP_URL']
    },
    {
      id: 'youtube-client',
      label: 'YouTube OAuth client',
      state: youtubeClientConfigured ? 'PASS' : 'ACTION',
      detail: youtubeClientConfigured ? 'Google OAuth client configuration is ready.' : 'Add the Google OAuth client values before connecting channels.',
      env: youtubeClientConfigured ? undefined : ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET']
    },
    {
      id: 'youtube-general',
      label: 'General YouTube channel',
      state: generalYouTubeReady ? 'PASS' : youtubeClientConfigured && enabledGeneral.length > 0 ? 'ACTION' : 'LOCKED',
      detail: generalYouTubeReady ? 'Every enabled GENERAL channel is OAuth-bound to YouTube.' : youtubeClientConfigured && enabledGeneral.length > 0 ? 'Connect the GENERAL channel from Settings.' : 'Waiting for the OAuth client and GENERAL channel record.',
      href: youtubeClientConfigured && enabledGeneral.length > 0 && !generalYouTubeReady ? '/settings' : undefined,
      actionLabel: youtubeClientConfigured && enabledGeneral.length > 0 && !generalYouTubeReady ? 'Connect YouTube' : undefined
    },
    {
      id: 'youtube-kids',
      label: 'Kids YouTube isolation',
      state: enabledKids.length === 0 ? 'LOCKED' : kidsYouTubeReady ? 'PASS' : 'ACTION',
      detail: enabledKids.length === 0 ? 'No kids channel exists yet. Kids production remains isolated and disabled.' : kidsYouTubeReady ? 'Every enabled KIDS channel has its own YouTube connection.' : 'Connect each kids channel separately. GENERAL credentials are never reused.',
      href: enabledKids.length > 0 && !kidsYouTubeReady ? '/settings' : undefined,
      actionLabel: enabledKids.length > 0 && !kidsYouTubeReady ? 'Connect Kids Channel' : undefined
    },
    {
      id: 'upload-lock',
      label: 'Real YouTube upload',
      state: uploadUnlocked ? (publishingProvider === 'youtube' ? 'PASS' : 'WARN') : 'LOCKED',
      detail: uploadUnlocked ? `Upload lock is open; publishing provider=${publishingProvider}.` : 'Locked by default. Keep it locked until one PRIVATE upload is intentionally planned.',
      env: uploadUnlocked ? undefined : ['PUBLISHING_PROVIDER', 'ALLOW_YOUTUBE_UPLOAD']
    },
    {
      id: 'autopilot-spend',
      label: 'Paid Autopilot spending',
      state: autopilotPaidUnlocked && paidGenerationUnlocked ? 'PASS' : 'LOCKED',
      detail: autopilotPaidUnlocked && paidGenerationUnlocked ? 'Automatic paid generation is explicitly unlocked.' : 'Locked separately from manual paid generation. This prevents background credit spending.',
      env: autopilotPaidUnlocked && paidGenerationUnlocked ? undefined : ['ALLOW_AUTOPILOT_PAID_GENERATION']
    },
    {
      id: 'public-lock',
      label: 'Public publishing',
      state: publicUnlocked && uploadUnlocked && publishingProvider === 'youtube' ? 'PASS' : 'LOCKED',
      detail: publicUnlocked ? 'Public publishing is unlocked.' : 'Locked. Leave this locked through the first PRIVATE end-to-end test.',
      env: publicUnlocked ? undefined : ['ALLOW_PUBLIC_PUBLISHING']
    }
  ];

  const mockReady = databaseReady && appSecretOk && appBaseUrlOk && enabledGeneral.length > 0 && promptsReady;
  const creativeConfigured = mockReady && anthropicConfigured;
  const realRenderConfigured = creativeConfigured && openArtConfigured && videoProvider === 'openart-mcp';
  const privateYouTubeConfigured = mockReady && youtubeClientConfigured && generalYouTubeReady && publishingProvider === 'youtube';
  const paidAutopilotReady = realRenderConfigured && paidGenerationUnlocked && autopilotPaidUnlocked;
  const publicPublishingReady = privateYouTubeConfigured && uploadUnlocked && publicUnlocked;

  return {
    generatedAt: new Date().toISOString(),
    checks,
    channels,
    counts: { prompts, generalPrompts, kidsPrompts },
    phases: {
      mockReady,
      creativeConfigured,
      realRenderConfigured,
      privateYouTubeConfigured,
      paidAutopilotReady,
      publicPublishingReady
    }
  };
}
