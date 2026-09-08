import { describe, expect, it } from 'vitest';
import type { CreativePlan } from './creative-director';
import { evaluateCreativeQuality } from './creative-quality';

function plan(overrides: Partial<CreativePlan> = {}): CreativePlan {
  const shots = Array.from({ length: 8 }, (_, index) => ({
    startSecond: index * 5,
    endSecond: (index + 1) * 5,
    visualPrompt: `Unique visual beat ${index} with distinct staging and action`,
    camera: 'Motivated medium-to-close move',
    narration: `Narration beat ${index}`
  }));
  return {
    hook: 'Something unexpected is hiding in this tiny world.',
    script: 'A complete original short story unfolds through a sequence of clear visual actions, escalating discoveries, and a final satisfying payoff for the viewer.',
    title: 'The Tiny World Nobody Noticed',
    description: 'An original short-form visual story.',
    hashtags: ['#Shorts', '#Miniature'],
    visualStyle: 'Original cinematic miniature photography.',
    audioDirection: 'Clear narration with restrained original music.',
    shots,
    safetyNotes: ['General audience, brand-safe production.'],
    ...overrides
  };
}

describe('creative quality gate', () => {
  it('passes a varied, well-paced 40 second plan', () => {
    const result = evaluateCreativeQuality(plan(), { durationSeconds: 40, channelType: 'GENERAL' });
    expect(result.blocking).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('blocks an under-cut two-shot plan before paid rendering', () => {
    const base = plan();
    const result = evaluateCreativeQuality(plan({ shots: base.shots.slice(0, 2) }), { durationSeconds: 40, channelType: 'GENERAL' });
    expect(result.blocking.join(' ')).toContain('Too few visual beats');
  });

  it('blocks repetitive shot prompts', () => {
    const repeated = plan().shots.map((shot) => ({ ...shot, visualPrompt: 'The exact same repeated visual prompt' }));
    const result = evaluateCreativeQuality(plan({ shots: repeated }), { durationSeconds: 40, channelType: 'GENERAL' });
    expect(result.blocking.join(' ')).toContain('too repetitive');
  });

  it('blocks commercial calls to action in kids content', () => {
    const result = evaluateCreativeQuality(plan({ script: 'A friendly story for children. Ask your parents to buy now before the adventure ends.', safetyNotes: ['Kids-safe, age-appropriate story.'] }), { durationSeconds: 40, channelType: 'KIDS_CHANNEL_ONLY' });
    expect(result.blocking.join(' ')).toContain('kids content');
  });
});
