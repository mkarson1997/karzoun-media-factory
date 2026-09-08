import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENART_MCP_URL,
  trustedOpenArtMcpUrl,
  trustedOpenArtTokenEndpoint
} from './openart-network-policy';

describe('OpenArt outbound network policy', () => {
  it('pins the MCP transport to the official endpoint', () => {
    expect(trustedOpenArtMcpUrl().toString()).toBe(DEFAULT_OPENART_MCP_URL);
    expect(() => trustedOpenArtMcpUrl('https://example.com/mcp')).toThrow(/official/);
    expect(() => trustedOpenArtMcpUrl('https://mcp.openart.ai/other')).toThrow(/exactly/);
  });

  it('allows HTTPS OAuth token endpoints only on OpenArt-owned hosts', () => {
    expect(trustedOpenArtTokenEndpoint('https://mcp.openart.ai/token').origin).toBe('https://mcp.openart.ai');
    expect(trustedOpenArtTokenEndpoint('https://auth.openart.ai/oauth/token').hostname).toBe('auth.openart.ai');
    expect(() => trustedOpenArtTokenEndpoint('https://attacker.example/token')).toThrow(/openart\.ai/);
  });

  it('rejects unsafe OAuth endpoint forms', () => {
    expect(() => trustedOpenArtTokenEndpoint('http://mcp.openart.ai/token')).toThrow(/HTTPS/);
    expect(() => trustedOpenArtTokenEndpoint('https://user:pass@mcp.openart.ai/token')).toThrow(/credentials/);
    expect(() => trustedOpenArtTokenEndpoint('https://mcp.openart.ai:8443/token')).toThrow(/custom port/);
    expect(() => trustedOpenArtTokenEndpoint('https://mcp.openart.ai/')).toThrow(/token path/);
    expect(() => trustedOpenArtTokenEndpoint('https://openart.ai.evil.example/token')).toThrow(/openart\.ai/);
  });
});
