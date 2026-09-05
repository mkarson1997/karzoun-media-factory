import { describe, expect, it } from 'vitest';
import { trustedAppBaseUrl, trustedAppUrl } from './app-origin';

function env(APP_BASE_URL: string): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', APP_BASE_URL };
}

describe('trusted application origin', () => {
  it('accepts HTTPS origins and loopback HTTP only', () => {
    expect(trustedAppBaseUrl(env('https://factory.example.com')).origin)
      .toBe('https://factory.example.com');
    expect(trustedAppBaseUrl(env('http://localhost:3100')).origin)
      .toBe('http://localhost:3100');
    expect(trustedAppBaseUrl(env('http://127.0.0.1:3100/')).origin)
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
      expect(() => trustedAppBaseUrl(env(candidate))).toThrow();
    }
  });

  it('keeps internal redirects on the configured origin', () => {
    const configured = env('https://factory.example.com');
    expect(trustedAppUrl('/settings?youtube=connected', configured).toString())
      .toBe('https://factory.example.com/settings?youtube=connected');
    expect(() => trustedAppUrl('//evil.example', configured)).toThrow();
    expect(() => trustedAppUrl('https://evil.example', configured)).toThrow();
  });
});
