export type ReadinessCheck = {
  name: string;
  ok: boolean;
  severity: 'required' | 'warning';
  detail: string;
};

function configured(value: string | undefined) {
  return Boolean(value && value.trim());
}

function safeBaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1');
  } catch {
    return false;
  }
}

function aiProviderConfigured(env: NodeJS.ProcessEnv, provider: string) {
  if (provider === 'groq') return configured(env.GROQ_API_KEY);
  if (provider === 'openai') return configured(env.OPENAI_API_KEY);
  if (provider === 'anthropic') return configured(env.ANTHROPIC_API_KEY) && configured(env.ANTHROPIC_MODEL);
  return false;
}

function remoteMediaAllowlistConfigured(env: NodeJS.ProcessEnv) {
  return (env.REMOTE_MEDIA_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim())
    .some(Boolean);
}

export function evaluateRuntimeSafety(env: NodeJS.ProcessEnv = process.env): ReadinessCheck[] {
  const production = env.NODE_ENV === 'production';
  const videoProvider = env.VIDEO_PROVIDER || 'mock';
  const zeroCost = env.ZERO_COST_MODE === 'true';
  const publishingProvider = env.PUBLISHING_PROVIDER || 'mock';
  const creativeDirector = env.CREATIVE_DIRECTOR || 'mock';
  const paid = !zeroCost && env.ALLOW_PAID_GENERATION === 'true';
  const autopilotPaid = !zeroCost && env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true';
  const uploads = env.ALLOW_YOUTUBE_UPLOAD === 'true';
  const publicPublishing = env.ALLOW_PUBLIC_PUBLISHING === 'true';
  const appSecretLength = env.APP_SECRET?.length ?? 0;

  const checks: ReadinessCheck[] = [
    {
      name: 'Zero-cost mode',
      ok: !zeroCost || videoProvider === 'local-demo' || videoProvider === 'local-ffmpeg',
      severity: 'required',
      detail: zeroCost ? 'ACTIVE: external AI and paid generation are runtime-blocked' : 'inactive'
    },
    {
      name: 'DATABASE_URL',
      ok: configured(env.DATABASE_URL),
      severity: 'required',
      detail: configured(env.DATABASE_URL) ? 'configured' : 'missing'
    },
    {
      name: 'APP_SECRET',
      ok: !production || appSecretLength >= 32,
      severity: 'required',
      detail: production ? (appSecretLength >= 32 ? 'production secret strength accepted' : 'production requires at least 32 characters') : 'development mode'
    },
    {
      name: 'APP_BASE_URL',
      ok: !production || safeBaseUrl(env.APP_BASE_URL),
      severity: 'required',
      detail: production
        ? (safeBaseUrl(env.APP_BASE_URL) ? 'HTTPS or loopback-only URL configured' : 'production requires HTTPS APP_BASE_URL, except loopback-only local operation')
        : (env.APP_BASE_URL || 'development default')
    }
  ];

  if (zeroCost) {
    checks.push({ name: 'AI creative director', ok: true, severity: 'warning', detail: 'local Ollama preferred; deterministic no-network fallback available' });
  } else if (creativeDirector === 'openai' || creativeDirector === 'groq' || creativeDirector === 'anthropic') {
    const remoteReady = aiProviderConfigured(env, creativeDirector);
    checks.push({
      name: 'AI creative director',
      ok: true,
      severity: 'warning',
      detail: remoteReady ? `${creativeDirector} configured; deterministic local fallback is available` : `${creativeDirector} unavailable; deterministic local fallback will be used`
    });
  }

  if (zeroCost) {
    checks.push({
      name: 'Video provider',
      ok: videoProvider === 'local-demo' || videoProvider === 'local-ffmpeg',
      severity: 'required',
      detail: `provider=${videoProvider}; local FFmpeg; cost $0; OpenArt disabled`
    });
    checks.push({ name: 'Paid generation lock', ok: true, severity: 'warning', detail: 'HARD LOCKED by ZERO_COST_MODE' });
  } else if (videoProvider === 'openart-mcp') {
    checks.push({
      name: 'OpenArt MCP configuration',
      ok: safeBaseUrl(env.OPENART_MCP_URL || 'https://mcp.openart.ai/mcp'),
      severity: 'required',
      detail: 'Direct authenticated MCP selected. OpenArt OAuth is resolved from the encrypted durable credential store, with .env as a fallback; no AI bridge is required.'
    });
    const mediaHostsConfigured = remoteMediaAllowlistConfigured(env);
    checks.push({
      name: 'Remote media host allowlist',
      ok: mediaHostsConfigured,
      severity: 'required',
      detail: mediaHostsConfigured
        ? 'explicit trusted REMOTE_MEDIA_ALLOWED_HOSTS configured'
        : 'REMOTE_MEDIA_ALLOWED_HOSTS is required before remote generated media can be ingested'
    });
    checks.push({
      name: 'Paid generation lock',
      ok: true,
      severity: 'warning',
      detail: paid ? 'UNLOCKED: provider credits can be spent' : 'locked'
    });
  } else {
    checks.push({
      name: 'Video provider',
      ok: videoProvider === 'mock' || videoProvider === 'mock-demo' || videoProvider === 'local-demo' || videoProvider === 'local-ffmpeg',
      severity: 'required',
      detail: `provider=${videoProvider}`
    });
  }

  checks.push({
    name: 'Autopilot paid generation interlock',
    ok: !autopilotPaid || (paid && videoProvider !== 'mock' && videoProvider !== 'mock-demo'),
    severity: 'required',
    detail: zeroCost ? 'automatic paid generation hard-locked by ZERO_COST_MODE' : autopilotPaid ? 'automatic paid generation explicitly unlocked' : 'automatic paid generation locked'
  });

  if (publishingProvider === 'youtube') {
    checks.push({
      name: 'YouTube OAuth client',
      ok: configured(env.YOUTUBE_CLIENT_ID) && configured(env.YOUTUBE_CLIENT_SECRET) && safeBaseUrl(env.APP_BASE_URL),
      severity: 'required',
      detail: 'YouTube publishing requires client ID, client secret and a safe APP_BASE_URL'
    });
  } else {
    checks.push({
      name: 'Publishing provider',
      ok: publishingProvider === 'mock',
      severity: 'required',
      detail: `provider=${publishingProvider}`
    });
  }

  checks.push({
    name: 'YouTube upload lock',
    ok: !uploads || publishingProvider === 'youtube',
    severity: 'required',
    detail: uploads ? 'real uploads enabled' : 'locked'
  });
  checks.push({
    name: 'Public publishing interlock',
    ok: !publicPublishing || (publishingProvider === 'youtube' && uploads),
    severity: 'required',
    detail: publicPublishing ? 'PUBLIC publishing enabled' : 'public publishing locked'
  });
  checks.push({
    name: 'Telegram pairing',
    ok: Boolean(env.TELEGRAM_BOT_TOKEN) === Boolean(env.TELEGRAM_ALLOWED_USER_ID),
    severity: 'required',
    detail: env.TELEGRAM_BOT_TOKEN ? 'token and allowlisted user must both be configured' : 'Telegram disabled'
  });

  return checks;
}

export function readinessSummary(checks: ReadinessCheck[]) {
  const blocking = checks.filter((check) => check.severity === 'required' && !check.ok);
  const warnings = checks.filter((check) => check.severity === 'warning');
  return { ready: blocking.length === 0, blocking, warnings, checks };
}
