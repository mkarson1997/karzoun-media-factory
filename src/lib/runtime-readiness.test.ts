import { describe, expect, it } from 'vitest';
import { evaluateRuntimeSafety, readinessSummary } from './runtime-readiness';

describe('runtime readiness', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://example.invalid/kmf',
    APP_SECRET: 'x'.repeat(48),
    APP_BASE_URL: 'https://factory.example.com',
    VIDEO_PROVIDER: 'mock',
    PUBLISHING_PROVIDER: 'mock',
    ALLOW_PAID_GENERATION: 'false',
    ALLOW_AUTOPILOT_PAID_GENERATION: 'false',
    ALLOW_YOUTUBE_UPLOAD: 'false',
    ALLOW_PUBLIC_PUBLISHING: 'false'
  } as NodeJS.ProcessEnv;

  it('accepts a locked-down production configuration', () => {
    expect(readinessSummary(evaluateRuntimeSafety(base)).ready).toBe(true);
  });

  it('rejects public publishing unless real YouTube upload is explicitly enabled', () => {
    const checks = evaluateRuntimeSafety({ ...base, ALLOW_PUBLIC_PUBLISHING: 'true' });
    expect(readinessSummary(checks).ready).toBe(false);
    expect(checks.find((item) => item.name === 'Public publishing interlock')?.ok).toBe(false);
  });

  it('rejects OpenArt MCP without all provider credentials', () => {
    const checks = evaluateRuntimeSafety({ ...base, VIDEO_PROVIDER: 'openart-mcp' });
    expect(readinessSummary(checks).ready).toBe(false);
  });

  it('rejects autopilot paid unlock unless general paid generation and a real provider are enabled', () => {
    const checks = evaluateRuntimeSafety({ ...base, ALLOW_AUTOPILOT_PAID_GENERATION: 'true' });
    expect(readinessSummary(checks).ready).toBe(false);
    expect(checks.find((item) => item.name === 'Autopilot paid generation interlock')?.ok).toBe(false);
  });

  it('accepts the autopilot paid unlock only with a configured real provider', () => {
    const checks = evaluateRuntimeSafety({
      ...base,
      VIDEO_PROVIDER: 'openart-mcp',
      ALLOW_PAID_GENERATION: 'true',
      ALLOW_AUTOPILOT_PAID_GENERATION: 'true',
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_MODEL: 'test-model',
      OPENART_MCP_ACCESS_TOKEN: 'test-token'
    });
    expect(readinessSummary(checks).ready).toBe(true);
  });

  it('requires a secure public URL and a strong APP_SECRET in production', () => {
    const checks = evaluateRuntimeSafety({ ...base, APP_BASE_URL: 'http://factory.example.com', APP_SECRET: 'short' });
    const summary = readinessSummary(checks);
    expect(summary.ready).toBe(false);
    expect(summary.blocking.map((item) => item.name)).toEqual(expect.arrayContaining(['APP_SECRET', 'APP_BASE_URL']));
  });

  it('allows HTTP only for loopback local operation', () => {
    const checks = evaluateRuntimeSafety({ ...base, APP_BASE_URL: 'http://localhost:3000' });
    expect(readinessSummary(checks).ready).toBe(true);
  });

  it('rejects half-configured Telegram control', () => {
    const checks = evaluateRuntimeSafety({ ...base, TELEGRAM_BOT_TOKEN: 'token' });
    expect(readinessSummary(checks).ready).toBe(false);
  });
});
