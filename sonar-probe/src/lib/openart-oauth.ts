import { trustedOpenArtTokenEndpoint } from './openart-network-policy';
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
  expiresAt?: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_in?: number;
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseStoredCredential(raw: string): OpenArtOAuthCredential | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return {
      accessToken: optionalString(value.accessToken),
      refreshToken: optionalString(value.refreshToken),
      clientId: optionalString(value.clientId),
      clientSecret: optionalString(value.clientSecret),
      tokenEndpoint: optionalString(value.tokenEndpoint),
      scope: optionalString(value.scope),
      tokenEndpointAuthMethod: optionalString(value.tokenEndpointAuthMethod),
      expiresAt: optionalString(value.expiresAt)
    };
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

function normalizedCredential(credential: OpenArtOAuthCredential): OpenArtOAuthCredential {
  const tokenEndpoint = credential.tokenEndpoint
    ? trustedOpenArtTokenEndpoint(credential.tokenEndpoint).toString()
    : undefined;
  return {
    accessToken: optionalString(credential.accessToken),
    refreshToken: optionalString(credential.refreshToken),
    clientId: optionalString(credential.clientId),
    clientSecret: optionalString(credential.clientSecret),
    tokenEndpoint,
    scope: optionalString(credential.scope),
    tokenEndpointAuthMethod: optionalString(credential.tokenEndpointAuthMethod),
    expiresAt: optionalString(credential.expiresAt)
  };
}

async function persistCredential(credential: OpenArtOAuthCredential) {
  const normalized = normalizedCredential(credential);
  const tokenEndpointHost = normalized.tokenEndpoint
    ? new URL(normalized.tokenEndpoint).host
    : null;

  await storeIntegrationSecret(OPENART_OAUTH_PROVIDER, JSON.stringify(normalized), {
    source: 'openart-oauth-refresh',
    hasRefreshToken: Boolean(normalized.refreshToken),
    tokenEndpointHost,
    refreshedAt: new Date().toISOString()
  });
}

function refreshRequest(credential: OpenArtOAuthCredential) {
  if (!credential.refreshToken || !credential.tokenEndpoint || !credential.clientId) return null;

  const tokenEndpoint = trustedOpenArtTokenEndpoint(credential.tokenEndpoint);
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

  return { body, headers, tokenEndpoint };
}

export async function getOpenArtAccessToken(options?: { forceRefresh?: boolean }): Promise<string | null> {
  const credential = await readCredential();
  const refresh = refreshRequest(credential);

  if (!refresh) return credential.accessToken ?? null;
  const expiresAt = credential.expiresAt ? Date.parse(credential.expiresAt) : 0;
  if (!options?.forceRefresh && credential.accessToken && expiresAt > Date.now() + 60_000) return credential.accessToken;

  try {
    const response = await fetch(refresh.tokenEndpoint, {
      method: 'POST',
      headers: refresh.headers,
      body: refresh.body,
      signal: AbortSignal.timeout(15_000),
      redirect: 'error'
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
      scope: payload.scope || credential.scope,
      expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : credential.expiresAt
    };

    await persistCredential(updated);
    return updated.accessToken ?? null;
  } catch (error) {
    if (credential.accessToken) return credential.accessToken;
    throw error;
  }
}

export async function storeOpenArtOAuthCredential(credential: OpenArtOAuthCredential) {
  if (!credential.accessToken && !credential.refreshToken) {
    throw new Error('OpenArt OAuth credential requires an access token or refresh token');
  }
  if (credential.refreshToken && (!credential.clientId || !credential.tokenEndpoint)) {
    throw new Error('Refresh-capable OpenArt OAuth credentials require clientId and tokenEndpoint');
  }
  await persistCredential(credential);
}

export async function hasDurableOpenArtOAuthCredential() {
  const credential = await readCredential();
  if (!credential.refreshToken || !credential.clientId || !credential.tokenEndpoint) return false;
  try {
    trustedOpenArtTokenEndpoint(credential.tokenEndpoint);
    return true;
  } catch {
    return false;
  }
}
