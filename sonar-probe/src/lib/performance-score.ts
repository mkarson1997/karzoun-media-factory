export interface PerformanceInput {
  views: number;
  engagedViews: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  averagePercentageViewed?: number | null;
}

export interface PerformanceBreakdown {
  score: number;
  engagedViewRate: number | null;
  interactionRate: number | null;
  subscriberConversionRate: number | null;
  sampleLabel: 'NO_DATA' | 'EARLY' | 'LEARNING' | 'STABLE';
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

/**
 * A deliberately simple, explainable score for ranking this factory's own Shorts.
 * It is not a YouTube ranking score and must never be presented as one.
 *
 * Weights:
 * - 45% average percentage viewed (80% is treated as a strong target)
 * - 20% engaged-view rate (70% target)
 * - 15% likes/comments/shares per view (5% target)
 * - 20% subscribers gained per view (1% target)
 */
export function calculatePerformance(input: PerformanceInput): PerformanceBreakdown {
  const engagedViewRate = ratio(input.engagedViews, input.views);
  const interactionRate = ratio(input.likes + input.comments + input.shares, input.views);
  const subscriberConversionRate = ratio(input.subscribersGained, input.views);

  if (input.views <= 0) {
    return {
      score: 0,
      engagedViewRate,
      interactionRate,
      subscriberConversionRate,
      sampleLabel: 'NO_DATA'
    };
  }

  const retention = clamp((input.averagePercentageViewed ?? 0) / 80);
  const engaged = clamp((engagedViewRate ?? 0) / 0.7);
  const interaction = clamp((interactionRate ?? 0) / 0.05);
  const subscriber = clamp((subscriberConversionRate ?? 0) / 0.01);

  const score = retention * 45 + engaged * 20 + interaction * 15 + subscriber * 20;
  const sampleLabel = input.views < 100 ? 'EARLY' : input.views < 1000 ? 'LEARNING' : 'STABLE';

  return {
    score: Math.round(score * 10) / 10,
    engagedViewRate,
    interactionRate,
    subscriberConversionRate,
    sampleLabel
  };
}
