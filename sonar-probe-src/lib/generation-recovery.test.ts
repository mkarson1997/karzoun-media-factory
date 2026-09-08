import { describe, expect, it } from 'vitest';
import { generationResetFields, generationWorkDecision, notificationDedupeKey } from './generation-recovery';

describe('generation recovery and idempotency', () => {
  const now = new Date('2026-08-24T12:00:00Z');

  it('resumes polling instead of submitting duplicate paid work', () => {
    expect(generationWorkDecision({ status: 'GENERATING', creationId: 'hist-1' }, now)).toBe('POLL');
    expect(generationWorkDecision({ status: 'QUEUED', creationId: 'hist-1' }, now)).toBe('NONE');
  });

  it('waits for an in-flight submission and quarantines stale unknown outcomes', () => {
    expect(generationWorkDecision({ status: 'GENERATING', startedAt: new Date(now.getTime() - 30_000) }, now)).toBe('WAIT');
    expect(generationWorkDecision({ status: 'GENERATING', startedAt: new Date(now.getTime() - 180_000) }, now)).toBe('FAIL_UNCERTAIN');
  });

  it('allows exactly a fresh queued job to submit', () => {
    expect(generationWorkDecision({ status: 'QUEUED' }, now)).toBe('SUBMIT');
    expect(generationWorkDecision({ status: 'FAILED' }, now)).toBe('NONE');
  });

  it('clears stale provider/media state while preserving the creative plan externally', () => {
    expect(generationResetFields()).toEqual(expect.objectContaining({ creationId: null, providerJobId: null, providerStatus: null, videoUrl: null, failureReason: null }));
    expect(generationResetFields()).not.toHaveProperty('creativeBrief');
  });

  it('deduplicates Telegram notices per generation attempt', () => {
    expect(notificationDedupeKey('review', 'job-1', 2)).toBe(notificationDedupeKey('review', 'job-1', 2));
    expect(notificationDedupeKey('review', 'job-1', 2)).not.toBe(notificationDedupeKey('review', 'job-1', 3));
    expect(notificationDedupeKey('review', 'job-1', 2)).not.toBe(notificationDedupeKey('failure', 'job-1', 2));
  });
});
