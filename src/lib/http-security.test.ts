import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertSameOriginMutation } from './http-security';

const ORIGINAL_APP_BASE_URL = process.env.APP_BASE_URL;

function requestWithOrigin(origin?: string) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  return { headers } as NextRequest;
}

describe('mutation origin enforcement', () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = 'https://factory.example.com';
  });

  afterEach(() => {
    if (ORIGINAL_APP_BASE_URL === undefined) delete process.env.APP_BASE_URL;
    else process.env.APP_BASE_URL = ORIGINAL_APP_BASE_URL;
  });

  it('accepts the exact configured application origin', () => {
    expect(() => assertSameOriginMutation(requestWithOrigin('https://factory.example.com'))).not.toThrow();
  });

  it('rejects a cross-origin mutation', () => {
    expect(() => assertSameOriginMutation(requestWithOrigin('https://evil.example.com')))
      .toThrow('Cross-origin mutation rejected');
  });

  it('rejects a mutation that omits the Origin header', () => {
    expect(() => assertSameOriginMutation(requestWithOrigin()))
      .toThrow('Cross-origin mutation rejected');
  });
});
