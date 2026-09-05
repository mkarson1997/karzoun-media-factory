import { google } from 'googleapis';
import { trustedAppUrl } from './app-origin';
import { prisma } from './prisma';
import { readIntegrationSecret, storeIntegrationSecret } from './secret-store';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];

function oauthConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('YouTube OAuth requires YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET');
  const redirectUri = trustedAppUrl('/api/youtube/callback').toString();
  return { clientId, clientSecret, redirectUri };
}

function credentialKey(factoryChannelId?: string) {
  return factoryChannelId ? `youtube-refresh-token:${factoryChannelId}` : 'youtube-refresh-token';
}

async function readRefreshToken(factoryChannelId?: string) {
  if (factoryChannelId) {
    const specific = await readIntegrationSecret(credentialKey(factoryChannelId));
    if (specific) return specific.secret;

    // Backward compatibility for the original GENERAL channel created before
    // channel-specific OAuth existed. KIDS channels never fall back to it.
    const channel = await prisma.channel.findUnique({ where: { id: factoryChannelId }, select: { type: true } });
    if (channel?.type === 'GENERAL') {
      const legacy = await readIntegrationSecret('youtube-refresh-token');
      if (legacy) return legacy.secret;
      if (process.env.YOUTUBE_REFRESH_TOKEN) return process.env.YOUTUBE_REFRESH_TOKEN;
    }
    return null;
  }

  const legacy = await readIntegrationSecret('youtube-refresh-token');
  return legacy?.secret || process.env.YOUTUBE_REFRESH_TOKEN || null;
}

export function createYouTubeOAuthClient() {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function createYouTubeAuthorizationUrl(state: string) {
  const client = createYouTubeOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: YOUTUBE_SCOPES,
    state
  });
}

export async function exchangeYouTubeAuthorizationCode(code: string, factoryChannelId?: string) {
  const client = createYouTubeOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    const existing = await readRefreshToken(factoryChannelId);
    if (!existing) throw new Error('Google did not return a refresh token. Reconnect YouTube and approve offline access');
    client.setCredentials({ ...tokens, refresh_token: existing });
    return client;
  }

  await storeIntegrationSecret(credentialKey(factoryChannelId), tokens.refresh_token, {
    scope: tokens.scope ?? YOUTUBE_SCOPES.join(' '),
    connectedAt: new Date().toISOString(),
    factoryChannelId: factoryChannelId ?? null
  });
  client.setCredentials(tokens);
  return client;
}

export async function getAuthorizedYouTubeClient(factoryChannelId?: string) {
  const client = createYouTubeOAuthClient();
  const refreshToken = await readRefreshToken(factoryChannelId);
  if (!refreshToken) throw new Error(factoryChannelId ? 'YouTube is not connected for this channel' : 'YouTube is not connected');
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function getYouTubeConnectionStatus(factoryChannelId?: string) {
  const hasClient = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
  let appOriginReady = false;
  try { trustedAppUrl('/api/youtube/callback'); appOriginReady = true; } catch { appOriginReady = false; }
  const configured = hasClient && appOriginReady;
  let hasRefreshToken = false;
  if (configured && process.env.APP_SECRET) {
    try { hasRefreshToken = Boolean(await readRefreshToken(factoryChannelId)); } catch { hasRefreshToken = false; }
  } else if (!factoryChannelId) {
    hasRefreshToken = Boolean(process.env.YOUTUBE_REFRESH_TOKEN);
  }
  return { configured, connected: configured && hasRefreshToken };
}
