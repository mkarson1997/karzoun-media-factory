import { describe, expect, it } from 'vitest';
import { evaluatePublishingWindow } from './publishing-guard';

describe('publishing runtime guard', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('allows publishing below the rolling 24h limit', () => {
    const state = evaluatePublishingWindow({
      limit: 3,
      now,
      publishedAt: [new Date('2026-08-21T08:00:00.000Z'), new Date('2026-08-20T18:00:00.000Z')]
    });
    expect(state.allowed).toBe(true);
    expect(state.used).toBe(2);
  });

  it('blocks when the rolling 24h limit is full', () => {
    const state = evaluatePublishingWindow({
      limit: 3,
      now,
      publishedAt: [
        new Date('2026-08-21T08:00:00.000Z'),
        new Date('2026-08-20T18:00:00.000Z'),
        new Date('2026-08-20T13:00:00.000Z')
      ]
    });
    expect(state.allowed).toBe(false);
    expect(state.nextAllowedAt?.toISOString()).toBe('2026-08-21T13:00:01.000Z');
  });

  it('ignores publications older than 24 hours', () => {
    const state = evaluatePublishingWindow({
      limit: 1,
      now,
      publishedAt: [new Date('2026-08-20T11:59:59.000Z')]
    });
    expect(state.allowed).toBe(true);
    expect(state.used).toBe(0);
  });
});
