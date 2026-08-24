import { afterEach, describe, expect, it } from 'vitest';
import { DeterministicCreativeDirector, getCreativeDirector, isLocalOllamaModel, MockCreativeDirector, normalizeCreativeTitle, ResilientCreativeDirector, validateTimeline, ZeroCostCreativeDirector } from './creative-director';

describe('creative director', () => {
  afterEach(() => { delete process.env.CREATIVE_DIRECTOR; delete process.env.ZERO_COST_MODE; });

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

  it('clamps AI titles that exceed the factory limit', () => {
    const title = 'A ridiculously long AI-generated title that keeps going far beyond the YouTube factory title limit';
    const normalized = normalizeCreativeTitle(title);
    expect(typeof normalized).toBe('string');
    expect((normalized as string).length).toBeLessThanOrEqual(55);
    expect(normalized).not.toBe(title);
  });

  it('selects OpenAI without making a network call', () => {
    process.env.CREATIVE_DIRECTOR = 'openai';
    expect(getCreativeDirector()).toBeInstanceOf(ResilientCreativeDirector);
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

  it('builds a valid production plan without any API call', async () => {
    const result = await new DeterministicCreativeDirector().prepare({ externalPromptId: 'KMF-0649', category: 'Science', concept: 'A drop becomes a cloud', fullPrompt: 'Show the water cycle as an original cinematic miniature.', durationSeconds: 45, channelType: 'GENERAL' });
    expect(result.model).toBe('deterministic-local');
    expect(result.plan.title.length).toBeLessThanOrEqual(55);
    expect(result.plan.shots.length).toBeGreaterThanOrEqual(5);
    expect(() => validateTimeline(result.plan, 45)).not.toThrow();
  });

  it('falls through an unavailable remote name to deterministic local planning', async () => {
    const result = await new ResilientCreativeDirector('unavailable').prepare({ externalPromptId: 'KMF-0649', category: 'Nature', concept: 'Cloud forest', fullPrompt: 'Create a safe original cloud forest short.', durationSeconds: 30, channelType: 'GENERAL' });
    expect(result.model).toBe('deterministic-local');
  });

  it('uses deterministic planning when local Ollama is unavailable', async () => {
    const unavailable = { prepare: async () => { throw new Error('offline'); } };
    const result = await new ZeroCostCreativeDirector(unavailable).prepare({ externalPromptId: 'KMF-ZERO', category: 'Nature', concept: 'Quiet aurora', fullPrompt: 'Show a safe original aurora scene.', durationSeconds: 30, channelType: 'GENERAL' });
    expect(result.model).toBe('deterministic-local');
    expect(result.plan.shots.at(-1)?.endSecond).toBe(30);
  });

  it('forces the zero-cost local planning hierarchy even if Groq is configured', () => {
    process.env.ZERO_COST_MODE = 'true';
    process.env.CREATIVE_DIRECTOR = 'groq';
    expect(getCreativeDirector()).toBeInstanceOf(ZeroCostCreativeDirector);
  });

  it('rejects Ollama cloud and embedding entries from zero-cost model selection', () => {
    expect(isLocalOllamaModel({ name: 'glm-5.2:cloud', remote_model: 'glm-5.2', size: 290 })).toBe(false);
    expect(isLocalOllamaModel({ name: 'qwen3-embedding:0.6b', size: 600_000_000 })).toBe(false);
    expect(isLocalOllamaModel({ name: 'qwen3:14b', size: 9_000_000_000 })).toBe(true);
  });
});
