import dns from 'node:dns/promises';
import https, { type RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import net from 'node:net';
import { type Readable, Transform } from 'node:stream';

const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const REQUEST_TIMEOUT_MS = 60_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type VettedRemoteTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export function isBlockedRemoteIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

export function isBlockedRemoteIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return isBlockedRemoteIpv4(normalized.slice(7));
  const family = net.isIP(normalized);
  if (family === 4) return isBlockedRemoteIpv4(normalized);
  if (family === 6) {
    return normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('100:');
  }
  return true;
}

function normalizeAllowedHost(value: string) {
  const host = value.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.includes('/') || host.includes(':') || host.includes('*') || host.includes('@')) return null;
  if (!/^[a-z0-9.-]+$/.test(host) || host.includes('..') || host.startsWith('.') || host.endsWith('.')) return null;
  return host;
}

function configuredAllowedHosts() {
  return (process.env.REMOTE_MEDIA_ALLOWED_HOSTS || '')
    .split(',')
    .map(normalizeAllowedHost)
    .filter((value): value is string => Boolean(value));
}

export function isRemoteMediaHostAllowed(hostname: string, configured = configuredAllowedHosts()) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return configured.includes(host);
}

async function validateRemoteUrl(raw: string): Promise<VettedRemoteTarget> {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Remote media URL must use HTTPS');
  if (url.username || url.password) throw new Error('Remote media URL cannot contain credentials');
  if (url.port && url.port !== '443') throw new Error('Remote media URL cannot use a custom port');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Local media hosts are not allowed');

  const allowedHosts = configuredAllowedHosts();
  if (!allowedHosts.length) throw new Error('REMOTE_MEDIA_ALLOWED_HOSTS must explicitly allow trusted media hosts');
  if (!isRemoteMediaHostAllowed(url.hostname, allowedHosts)) {
    throw new Error('Remote media host is not an exact entry in REMOTE_MEDIA_ALLOWED_HOSTS');
  }

  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedRemoteIp(entry.address))) {
    throw new Error('Remote media host resolved to a blocked network');
  }

  const selected = addresses.find((entry) => entry.family === 4 || entry.family === 6);
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new Error('Remote media host did not resolve to a supported address');
  }
  return { url, address: selected.address, family: selected.family };
}

export function pinnedRemoteRequestOptions(target: VettedRemoteTarget): RequestOptions {
  return {
    protocol: 'https:',
    hostname: target.address,
    port: 443,
    method: 'GET',
    path: `${target.url.pathname}${target.url.search}`,
    servername: target.url.hostname,
    rejectUnauthorized: true,
    headers: {
      host: target.url.hostname,
      'user-agent': 'Karzoun-Media-Factory/1.0'
    }
  };
}

function requestPinnedRemote(target: VettedRemoteTarget) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = https.request(pinnedRemoteRequestOptions(target), resolve);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Remote media request timed out'));
    });
    request.once('error', reject);
    request.end();
  });
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sizeLimitedStream(body: Readable) {
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_MEDIA_BYTES) {
        callback(new Error('Remote media exceeded the 1 GB safety limit while streaming'));
        return;
      }
      callback(null, chunk);
    }
  });
  return body.pipe(limiter);
}

export async function openSafeRemoteMedia(rawUrl: string) {
  let current = await validateRemoteUrl(rawUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await requestPinnedRemote(current);
    const status = response.statusCode ?? 0;

    if (REDIRECT_STATUSES.has(status)) {
      const location = headerValue(response.headers.location);
      response.resume();
      if (!location) throw new Error('Remote media redirect had no location');
      current = await validateRemoteUrl(new URL(location, current.url).toString());
      continue;
    }

    if (status < 200 || status >= 300) {
      response.resume();
      throw new Error(`Remote media download failed with status ${status}`);
    }

    const contentType = (headerValue(response.headers['content-type']) ?? '').toLowerCase();
    if (!(contentType.startsWith('video/') || contentType === 'application/octet-stream' || contentType === 'binary/octet-stream')) {
      response.resume();
      throw new Error(`Remote media returned unsupported content type: ${contentType || 'unknown'}`);
    }

    const contentLengthHeader = headerValue(response.headers['content-length']);
    const declaredLength = Number(contentLengthHeader ?? '0');
    if (declaredLength && (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_MEDIA_BYTES)) {
      response.resume();
      throw new Error('Remote media has an invalid or oversized content length');
    }

    return {
      stream: sizeLimitedStream(response),
      contentType,
      contentLength: declaredLength || null,
      finalUrl: current.url.toString()
    };
  }

  throw new Error('Remote media exceeded the redirect limit');
}
