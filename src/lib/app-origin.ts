const DEFAULT_LOCAL_APP_BASE_URL = 'http://localhost:3100';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function trustedAppBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.APP_BASE_URL?.trim() || DEFAULT_LOCAL_APP_BASE_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('APP_BASE_URL must be a valid absolute URL');
  }

  if (url.username || url.password) throw new Error('APP_BASE_URL cannot contain credentials');
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('APP_BASE_URL must contain only an origin');
  }

  const host = url.hostname.toLowerCase();
  const secureRemote = url.protocol === 'https:';
  const localHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(host);
  if (!secureRemote && !localHttp) {
    throw new Error('APP_BASE_URL must use HTTPS, except for an explicit loopback development origin');
  }

  return new URL(url.origin);
}

export function trustedAppUrl(pathname: string, env: NodeJS.ProcessEnv = process.env) {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) {
    throw new Error('Application redirect path must be relative to the trusted origin');
  }
  const base = trustedAppBaseUrl(env);
  const target = new URL(pathname, `${base.origin}/`);
  if (target.origin !== base.origin) throw new Error('Application redirect escaped the trusted origin');
  return target;
}
