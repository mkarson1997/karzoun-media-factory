import { describe, expect, it } from 'vitest';
import { trustedAppBaseUrl, trustedAppUrl } from './app-origin';

describe('trusted application origin', () => {
  it('accepts HTTPS origins and loopback HTTP only', () => {
    expect(trustedAppBaseUrl({ APP_BASE_URL: 'https://factory.example.com' } as NodeJS.ProcessEnv).origin)
      .toBe('https://factory.example.com');
    expect(trustedAppBaseUrl({ APP_BASE_URL: 'http://localhost:3100' } as NodeJS.ProcessEnv).origin)
      .toBe('http://localhost:3100');
    expect(trustedAppBaseUrl({ APP_BASE_URL: 'http://127.0.0.1:3100/' } as NodeJS.ProcessEnv).origin)
      .toBe('http://127.0.0.1:3100');
  });

  it('rejects remote HTTP, credentials and origin smuggling', () => {
    for (const candidate of [
      'http://factory.example.com',
      'https://user:pass@factory.example.com',
      'https://factory.example.com/app',
      'https://factory.example.com?next=https://evil.example',
      'javascript:alert(1)'
    ]) {
      expect(() => trustedAppBaseUrl({ APP_BASE_URL: candidate } as NodeJS.ProcessEnv)).toThrow();
    }
  });

  it('keeps internal redirects on the configured origin', () => {
    const env = { APP_BASE_URL: 'https://factory.example.com' } as NodeJS.ProcessEnv;
    expect(trustedAppUrl('/settings?youtube=connected', env).toString())
      .toBe('https://factory.example.com/settings?youtube=connected');
    expect(() => trustedAppUrl('//evil.example', env)).toThrow();
    expect(() => trustedAppUrl('https://evil.example', env)).toThrow();
  });
});
