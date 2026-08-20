import { describe, expect, it } from 'vitest';
import { calculatePerformance } from './performance-score';

describe('calculatePerformance', () => {
  it('returns zero without views', () => {
    expect(calculatePerformance({
      views: 0,
      engagedViews: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      subscribersGained: 0,
      averagePercentageViewed: null
    })).toMatchObject({ score: 0, sampleLabel: 'NO_DATA' });
  });

  it('caps a very strong video at 100', () => {
    const result = calculatePerformance({
      views: 10000,
      engagedViews: 9000,
      likes: 900,
      comments: 100,
      shares: 200,
      subscribersGained: 250,
      averagePercentageViewed: 120
    });
    expect(result.score).toBe(100);
    expect(result.sampleLabel).toBe('STABLE');
  });

  it('marks small samples as early', () => {
    const result = calculatePerformance({
      views: 50,
      engagedViews: 30,
      likes: 2,
      comments: 1,
      shares: 0,
      subscribersGained: 0,
      averagePercentageViewed: 65
    });
    expect(result.sampleLabel).toBe('EARLY');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
