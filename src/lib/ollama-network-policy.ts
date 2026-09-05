const DEFAULT_OLLAMA_BASE_URL = 'http://host.docker.internal:11434';
const LOCAL_OLLAMA_HOSTS = new Map<string, string>([
  ['localhost', 'localhost'],
  ['127.0.0.1', '127.0.0.1'],
  ['[::1]', '[::1]'],
  ['host.docker.internal', 'host.docker.internal']
]);

export function trustedOllamaBaseUrl(raw = DEFAULT_OLLAMA_BASE_URL) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('OLLAMA_BASE_URL must be a valid local URL');
  }

  if (parsed.protocol !== 'http:') {
    throw new Error('OLLAMA_BASE_URL must use local HTTP');
  }
  if (parsed.username || parsed.password) {
    throw new Error('OLLAMA_BASE_URL cannot contain credentials');
  }
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('OLLAMA_BASE_URL must contain only a local origin');
  }

  const host = parsed.hostname.toLowerCase();
  const canonicalHost = LOCAL_OLLAMA_HOSTS.get(host);
  if (!canonicalHost) {
    throw new Error('OLLAMA_BASE_URL must use localhost, loopback, or host.docker.internal');
  }

  const port = parsed.port ? Number(parsed.port) : 11434;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('OLLAMA_BASE_URL contains an invalid port');
  }

  return `http://${canonicalHost}:${port}`;
}

export function trustedOllamaUrl(pathname: '/api/tags' | '/api/generate', raw?: string) {
  return new URL(pathname, `${trustedOllamaBaseUrl(raw)}/`);
}

export { DEFAULT_OLLAMA_BASE_URL };
