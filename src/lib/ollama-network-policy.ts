export const DEFAULT_OLLAMA_BASE_URL = 'http://host.docker.internal:11434';

const TRUSTED_OLLAMA_ORIGINS = new Map<string, string>([
  ['http://localhost:11434', 'http://localhost:11434'],
  ['http://127.0.0.1:11434', 'http://127.0.0.1:11434'],
  ['http://[::1]:11434', 'http://[::1]:11434'],
  ['http://host.docker.internal:11434', 'http://host.docker.internal:11434']
]);

export function trustedOllamaBaseUrl(raw = DEFAULT_OLLAMA_BASE_URL) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('OLLAMA_BASE_URL must be a valid local URL');
  }

  if (parsed.username || parsed.password) {
    throw new Error('OLLAMA_BASE_URL cannot contain credentials');
  }
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('OLLAMA_BASE_URL must contain only a local origin');
  }

  const trusted = TRUSTED_OLLAMA_ORIGINS.get(parsed.origin.toLowerCase());
  if (!trusted) {
    throw new Error('OLLAMA_BASE_URL must use the standard Ollama port on localhost, loopback, or host.docker.internal');
  }
  return trusted;
}

export function trustedOllamaUrl(pathname: '/api/tags' | '/api/generate', raw?: string) {
  const base = trustedOllamaBaseUrl(raw);
  if (pathname === '/api/tags') return new URL('/api/tags', `${base}/`);
  return new URL('/api/generate', `${base}/`);
}
