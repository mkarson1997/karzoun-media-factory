import { describe, expect, it } from 'vitest';
import { DEFAULT_OLLAMA_BASE_URL, trustedOllamaBaseUrl, trustedOllamaUrl } from './ollama-network-policy';

describe('Ollama local-only network policy', () => {
  it('accepts only the fixed local Ollama origins', () => {
    expect(trustedOllamaBaseUrl()).toBe(DEFAULT_OLLAMA_BASE_URL);
    expect(trustedOllamaBaseUrl('http://localhost:11434')).toBe('http://localhost:11434');
    expect(trustedOllamaBaseUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
    expect(trustedOllamaBaseUrl('http://[::1]:11434')).toBe('http://[::1]:11434');
  });

  it('rejects remote, spoofed, credentialed and non-standard destinations', () => {
    for (const candidate of [
      'https://localhost:11434',
      'http://example.com:11434',
      'http://host.docker.internal.evil.example:11434',
      'http://user:pass@localhost:11434',
      'http://localhost:11435',
      'http://localhost:11434/api/tags',
      'http://localhost:11434?next=http://169.254.169.254'
    ]) {
      expect(() => trustedOllamaBaseUrl(candidate)).toThrow();
    }
  });

  it('constructs only the two permitted Ollama API routes', () => {
    expect(trustedOllamaUrl('/api/tags', 'http://localhost:11434').toString()).toBe('http://localhost:11434/api/tags');
    expect(trustedOllamaUrl('/api/generate', 'http://127.0.0.1:11434').toString()).toBe('http://127.0.0.1:11434/api/generate');
  });
});
