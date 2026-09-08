import { ChannelType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { dateToLocalInput, localDateTimeToUtc, rankPublishingHours } from './smart-scheduler';

describe('smart scheduler', () => {
  it('round-trips an Istanbul local date through UTC', () => {
    const utc = localDateTimeToUtc('2026-08-21T19:00', 'Europe/Istanbul');
    expect(dateToLocalInput(utc, 'Europe/Istanbul')).toBe('2026-08-21T19:00');
  });

  it('uses starter slots before enough scored history exists', () => {
    const profile = rankPublishingHours([], 'Europe/Istanbul', ChannelType.GENERAL);
    expect(profile.source).toBe('STARTER');
    expect(profile.slots).toHaveLength(3);
  });

  it('learns stronger recurring hours from factory performance', () => {
    const samples = [
      { publishedAt: localDateTimeToUtc('2026-08-01T19:00', 'Europe/Istanbul'), score: 91 },
      { publishedAt: localDateTimeToUtc('2026-08-02T19:00', 'Europe/Istanbul'), score: 88 },
      { publishedAt: localDateTimeToUtc('2026-08-03T12:00', 'Europe/Istanbul'), score: 55 },
      { publishedAt: localDateTimeToUtc('2026-08-04T12:00', 'Europe/Istanbul'), score: 58 },
      { publishedAt: localDateTimeToUtc('2026-08-05T16:00', 'Europe/Istanbul'), score: 64 },
      { publishedAt: localDateTimeToUtc('2026-08-06T16:00', 'Europe/Istanbul'), score: 66 }
    ];
    const profile = rankPublishingHours(samples, 'Europe/Istanbul', ChannelType.GENERAL);
    expect(profile.source).toBe('LEARNED');
    expect(profile.slots[0].hour).toBe(19);
    expect(profile.slots[0].score).toBeGreaterThan(80);
  });
});
