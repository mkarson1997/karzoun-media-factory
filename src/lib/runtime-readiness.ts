export type ReadinessCheck = {
  name: string;
  ok: boolean;
  severity: 'required' | 'warning';
  detail: string;
};

function configured(value: string | undefined) {
  return Boolean(value && value.trim());
}

function httpsUrl(value: string | undefined) {
  if (!value) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function evaluateRuntimeSafety(env: NodeJS.ProcessEnv = process.env): ReadinessCheck[] {
  const production = env.NODE_ENV === 'production';
  const videoProvider = env.VIDEO_PROVIDER || 'mock';
  const publishingProvider = env.PUBLISHING_PROVIDER || 'mock';
  const paid = env.ALLOW_PAID_GENERATION === 'true';
  const autopilotPaid = env.ALLOW_AUTOPILOT_PAID_GENERATION === 'true';
  const uploads = env.ALLOW_YOUTUBE_UPLOAD === 'true';
  const publicPublishing = env.ALLOW_PUBLIC_PUBLISHING === 'true';
  const appSecretLength = env.APP_SECRET?.length ?? 0;

  const checks: ReadinessCheck[] = [
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
      ok: !production || httpsUrl(env.APP_BASE_URL),
      severity: 'required',
      detail: production ? (httpsUrl(env.APP_BASE_URL) ? 'HTTPS URL configured' : 'production requires HTTPS APP_BASE_URL') : (env.APP_BASE_URL || 'development default')
    }
  ];

  if (videoProvider === 'openart-mcp') {
    checks.push({
      name: 'OpenArt MCP configuration',
      ok: configured(env.ANTHROPIC_API_KEY) && configured(env.ANTHROPIC_MODEL) && configured(env.OPENART_MCP_ACCESS_TOKEN),
      severity: 'required',
      detail: 'ANTHROPIC_API_KEY, ANTHROPIC_MODEL and OPENART_MCP_ACCESS_TOKEN are required for openart-mcp'
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
      ok: videoProvider === 'mock' || videoProvider === 'mock-demo',
      severity: 'required',
      detail: `provider=${videoProvider}`
    });
  }

  checks.push({
    name: 'Autopilot paid generation interlock',
    ok: !autopilotPaid || (paid && videoProvider !== 'mock' && videoProvider !== 'mock-demo'),
    severity: 'required',
    detail: autopilotPaid ? 'automatic paid generation explicitly unlocked' : 'automatic paid generation locked'
  });

  if (publishingProvider === 'youtube') {
    checks.push({
      name: 'YouTube OAuth client',
      ok: configured(env.YOUTUBE_CLIENT_ID) && configured(env.YOUTUBE_CLIENT_SECRET) && configured(env.APP_BASE_URL),
      severity: 'required',
      detail: 'YouTube publishing requires client ID, client secret and APP_BASE_URL'
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
