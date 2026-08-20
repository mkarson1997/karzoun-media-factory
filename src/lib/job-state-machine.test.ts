import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, nextStatuses } from './job-state-machine';

describe('production job state machine', () => {
  it('accepts the golden path', () => {
    const path = ['DRAFT','QUEUED','GENERATING','READY_FOR_REVIEW','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('supports reject, retry and cancellation paths', () => {
    expect(canTransition('READY_FOR_REVIEW', 'REJECTED')).toBe(true);
    expect(canTransition('REJECTED', 'QUEUED')).toBe(true);
    expect(canTransition('FAILED', 'QUEUED')).toBe(true);
    expect(canTransition('QUEUED', 'CANCELLED')).toBe(true);
  });

  it('rejects dangerous skips', () => {
    expect(canTransition('QUEUED', 'PUBLISHED')).toBe(false);
    expect(canTransition('READY_FOR_REVIEW', 'SCHEDULED')).toBe(false);
    expect(() => assertTransition('PUBLISHED', 'QUEUED')).toThrow(/Invalid production job transition/);
  });

  it('returns explicit next states', () => {
    expect(nextStatuses('GENERATING')).toEqual(['READY_FOR_REVIEW', 'FAILED', 'CANCELLED']);
    expect(nextStatuses('PUBLISHED')).toEqual([]);
  });
});
