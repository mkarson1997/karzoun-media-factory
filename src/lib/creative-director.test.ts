import { describe, expect, it } from 'vitest';
import { MockCreativeDirector, validateTimeline } from './creative-director';

describe('creative director', () => {
  it('creates a deterministic credit-free plan in mock mode', async () => {
    const director = new MockCreativeDirector();
    const result = await director.prepare({
      externalPromptId: 'KML-0001',
      category: 'Science',
      concept: 'Why bubbles are round',
      fullPrompt: 'Create an original science short explaining why bubbles are round.',
      durationSeconds: 42,
      channelType: 'GENERAL'
    });
    expect(result.model).toBe('mock-creative-director');
    expect(result.plan.title.length).toBeLessThanOrEqual(55);
    expect(result.plan.shots[0].startSecond).toBe(0);
    expect(result.plan.shots.at(-1)?.endSecond).toBe(42);
    expect(() => validateTimeline(result.plan, 42)).not.toThrow();
  });

  it('marks kids plans for isolated routing', async () => {
    const result = await new MockCreativeDirector().prepare({
      externalPromptId: 'KML-0901',
      category: 'Kids',
      concept: 'A fox learns to share',
      fullPrompt: 'Create a friendly original children story.',
      durationSeconds: 35,
      channelType: 'KIDS_CHANNEL_ONLY'
    });
    expect(result.plan.safetyNotes.join(' ')).toContain('Kids-only');
  });
});
