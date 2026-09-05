import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable, Transform } from 'node:stream';

const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;
const MAX_REDIRECTS = 4;

function blockedIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function blockedIp(address: string) {
  if (address.startsWith('::ffff:')) return blockedIpv4(address.slice(7));
  const family = net.isIP(address);
  if (family === 4) return blockedIpv4(address);
  if (family === 6) {
    const value = address.toLowerCase();
    return value === '::1' || value === '::' || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff');
  }
  return true;
}

function configuredAllowedHosts() {
  return (process.env.REMOTE_MEDIA_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => Boolean(value) && !value.includes('/') && !value.includes(':'));
}

function allowedHost(hostname: string) {
  const configured = configuredAllowedHosts();
  if (!configured.length) return false;
  const host = hostname.toLowerCase();
  return configured.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

async function validateRemoteUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('Remote media URL must use HTTPS');
  if (url.username || url.password) throw new Error('Remote media URL cannot contain credentials');
  if (url.port && url.port !== '443') throw new Error('Remote media URL cannot use a custom port');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Local media hosts are not allowed');
  if (!configuredAllowedHosts().length) throw new Error('REMOTE_MEDIA_ALLOWED_HOSTS must explicitly allow trusted media hosts');
  if (!allowedHost(url.hostname)) throw new Error('Remote media host is not in REMOTE_MEDIA_ALLOWED_HOSTS');

  const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => blockedIp(entry.address))) throw new Error('Remote media host resolved to a blocked network');
  return url;
}

function sizeLimitedStream(body: ReadableStream<Uint8Array>) {
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
  return Readable.fromWeb(body as never).pipe(limiter);
}

export async function openSafeRemoteMedia(rawUrl: string) {
  let current = await validateRemoteUrl(rawUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
      headers: { 'user-agent': 'Karzoun-Media-Factory/1.0' }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Remote media redirect had no location');
      current = await validateRemoteUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Remote media download failed with status ${response.status}`);

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!(contentType.startsWith('video/') || contentType === 'application/octet-stream' || contentType === 'binary/octet-stream')) {
      throw new Error(`Remote media returned unsupported content type: ${contentType || 'unknown'}`);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (declaredLength && (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_MEDIA_BYTES)) {
      throw new Error('Remote media has an invalid or oversized content length');
    }

    return {
      stream: sizeLimitedStream(response.body as ReadableStream<Uint8Array>),
      contentType,
      contentLength: declaredLength || null,
      finalUrl: current.toString()
    };
  }

  throw new Error('Remote media exceeded the redirect limit');
}
