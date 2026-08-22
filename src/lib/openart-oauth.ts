import { readIntegrationSecret, storeIntegrationSecret } from './secret-store';

const OPENART_OAUTH_PROVIDER = 'openart-mcp-oauth';

type OpenArtOAuthCredential = {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  tokenEndpoint?: string;
  scope?: string;
  tokenEndpointAuthMethod?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
};

function parseStoredCredential(raw: string): OpenArtOAuthCredential | null {
  try {
    const value = JSON.parse(raw) as OpenArtOAuthCredential;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function envCredential(): OpenArtOAuthCredential {
  return {
    accessToken: process.env.OPENART_MCP_ACCESS_TOKEN?.trim() || undefined,
    refreshToken: process.env.OPENART_MCP_REFRESH_TOKEN?.trim() || undefined,
    clientId: process.env.OPENART_MCP_CLIENT_ID?.trim() || undefined,
    clientSecret: process.env.OPENART_MCP_CLIENT_SECRET?.trim() || undefined,
    tokenEndpoint: process.env.OPENART_MCP_TOKEN_ENDPOINT?.trim() || undefined,
    scope: process.env.OPENART_MCP_SCOPE?.trim() || undefined,
    tokenEndpointAuthMethod: process.env.OPENART_MCP_TOKEN_ENDPOINT_AUTH_METHOD?.trim() || undefined
  };
}

async function readCredential(): Promise<OpenArtOAuthCredential> {
  try {
    const stored = await readIntegrationSecret(OPENART_OAUTH_PROVIDER);
    if (stored?.secret) {
      const parsed = parseStoredCredential(stored.secret);
      if (parsed) return parsed;
    }
  } catch {
    // The encrypted database credential is preferred, but .env remains a bootstrap fallback.
  }
  return envCredential();
}

async function persistCredential(credential: OpenArtOAuthCredential) {
  const tokenEndpointHost = credential.tokenEndpoint
    ? (() => {
        try { return new URL(credential.tokenEndpoint).host; } catch { return null; }
      })()
    : null;

  await storeIntegrationSecret(OPENART_OAUTH_PROVIDER, JSON.stringify(credential), {
    source: 'openart-oauth-refresh',
    hasRefreshToken: Boolean(credential.refreshToken),
    tokenEndpointHost,
    refreshedAt: new Date().toISOString()
  });
}

function refreshRequest(credential: OpenArtOAuthCredential) {
  if (!credential.refreshToken || !credential.tokenEndpoint || !credential.clientId) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credential.refreshToken,
    client_id: credential.clientId
  });
  if (credential.scope) body.set('scope', credential.scope);

  const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
  const method = credential.tokenEndpointAuthMethod?.toLowerCase();

  if (credential.clientSecret && method === 'client_secret_basic') {
    headers.set('authorization', `Basic ${Buffer.from(`${credential.clientId}:${credential.clientSecret}`).toString('base64')}`);
  } else if (credential.clientSecret) {
    body.set('client_secret', credential.clientSecret);
  }

  return { body, headers };
}

export async function getOpenArtAccessToken(): Promise<string | null> {
  const credential = await readCredential();
  const refresh = refreshRequest(credential);

  if (!refresh) return credential.accessToken ?? null;

  try {
    const response = await fetch(credential.tokenEndpoint!, {
      method: 'POST',
      headers: refresh.headers,
      body: refresh.body,
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      if (credential.accessToken) return credential.accessToken;
      throw new Error(`OpenArt OAuth refresh failed with HTTP ${response.status}`);
    }

    const payload = await response.json() as TokenResponse;
    if (!payload.access_token) {
      if (credential.accessToken) return credential.accessToken;
      throw new Error('OpenArt OAuth refresh response did not include an access token');
    }

    const updated: OpenArtOAuthCredential = {
      ...credential,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || credential.refreshToken,
      scope: payload.scope || credential.scope
    };

    await persistCredential(updated);
    return updated.accessToken ?? null;
  } catch (error) {
    if (credential.accessToken) return credential.accessToken;
    throw error;
  }
}

export async function storeOpenArtOAuthCredential(credential: OpenArtOAuthCredential) {
  if (!credential.accessToken && !credential.refreshToken) throw new Error('OpenArt OAuth credential requires an access token or refresh token');
  await persistCredential(credential);
}

export async function hasDurableOpenArtOAuthCredential() {
  const credential = await readCredential();
  return Boolean(credential.refreshToken && credential.clientId && credential.tokenEndpoint);
}
