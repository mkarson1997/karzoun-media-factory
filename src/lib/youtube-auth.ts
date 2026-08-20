import { google } from 'googleapis';
import { readIntegrationSecret, storeIntegrationSecret } from './secret-store';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];

function oauthConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const baseUrl = process.env.APP_BASE_URL;
  if (!clientId || !clientSecret || !baseUrl) throw new Error('YouTube OAuth requires YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and APP_BASE_URL');
  const redirectUri = new URL('/api/youtube/callback', baseUrl).toString();
  return { clientId, clientSecret, redirectUri };
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

export async function exchangeYouTubeAuthorizationCode(code: string) {
  const client = createYouTubeOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    const existing = await readIntegrationSecret('youtube-refresh-token');
    if (!existing) throw new Error('Google did not return a refresh token. Reconnect YouTube and approve offline access');
    client.setCredentials({ ...tokens, refresh_token: existing.secret });
    return client;
  }

  await storeIntegrationSecret('youtube-refresh-token', tokens.refresh_token, {
    scope: tokens.scope ?? YOUTUBE_SCOPES.join(' '),
    connectedAt: new Date().toISOString()
  });
  client.setCredentials(tokens);
  return client;
}

export async function getAuthorizedYouTubeClient() {
  const client = createYouTubeOAuthClient();
  const stored = await readIntegrationSecret('youtube-refresh-token');
  const refreshToken = stored?.secret || process.env.YOUTUBE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('YouTube is not connected');
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

export async function getYouTubeConnectionStatus() {
  const hasClient = Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.APP_BASE_URL);
  let hasRefreshToken = Boolean(process.env.YOUTUBE_REFRESH_TOKEN);
  if (!hasRefreshToken && process.env.APP_SECRET) {
    try { hasRefreshToken = Boolean(await readIntegrationSecret('youtube-refresh-token')); } catch { hasRefreshToken = false; }
  }
  return { configured: hasClient, connected: hasClient && hasRefreshToken };
}
