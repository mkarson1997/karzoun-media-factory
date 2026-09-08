export const DEFAULT_OPENART_MCP_URL = 'https://mcp.openart.ai/mcp';

function parseHttpsUrl(raw: string, label: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${label} cannot contain credentials`);
  if (url.port && url.port !== '443') throw new Error(`${label} cannot use a custom port`);
  return url;
}

function isOpenArtHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'openart.ai' || host.endsWith('.openart.ai');
}

export function trustedOpenArtMcpUrl(raw = DEFAULT_OPENART_MCP_URL) {
  const url = parseHttpsUrl(raw, 'OpenArt MCP URL');
  if (url.hostname.toLowerCase() !== 'mcp.openart.ai') {
    throw new Error('OpenArt MCP URL must use the official mcp.openart.ai host');
  }
  if (url.pathname !== '/mcp' || url.search || url.hash) {
    throw new Error('OpenArt MCP URL must be exactly https://mcp.openart.ai/mcp');
  }
  return new URL(DEFAULT_OPENART_MCP_URL);
}

export function trustedOpenArtTokenEndpoint(raw: string) {
  const url = parseHttpsUrl(raw, 'OpenArt OAuth token endpoint');
  if (!isOpenArtHost(url.hostname)) {
    throw new Error('OpenArt OAuth token endpoint must stay on an openart.ai host');
  }
  if (url.pathname === '/' || !url.pathname) {
    throw new Error('OpenArt OAuth token endpoint must include a token path');
  }
  url.hash = '';
  return url;
}
