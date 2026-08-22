import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createOpenAIResponse, getOpenAIOutputText, responsesProviderConfigured, selectedOpenAIModel, selectedResponsesProvider } from './openai-responses';

export const creativePlanSchema = z.object({
  hook: z.string().min(1).max(220),
  script: z.string().min(20).max(6000),
  title: z.string().min(1).max(55),
  description: z.string().min(1).max(1000),
  hashtags: z.array(z.string().min(1).max(80)).min(1).max(6),
  visualStyle: z.string().min(1).max(500),
  audioDirection: z.string().min(1).max(500),
  shots: z.array(z.object({
    startSecond: z.number().min(0),
    endSecond: z.number().positive(),
    visualPrompt: z.string().min(10).max(2000),
    camera: z.string().min(1).max(300),
    narration: z.string().max(1000).default('')
  })).min(2).max(24),
  safetyNotes: z.array(z.string().max(300)).max(12).default([])
});

export type CreativePlan = z.infer<typeof creativePlanSchema>;

export interface CreativeDirectorInput {
  externalPromptId: string;
  category: string;
  concept: string;
  fullPrompt: string;
  durationSeconds: number;
  channelType: 'GENERAL' | 'KIDS_CHANNEL_ONLY';
}

export interface CreativeDirectorResult {
  model: string;
  plan: CreativePlan;
}

export interface CreativeDirector {
  prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult>;
}

const CREATIVE_SYSTEM = 'You are the creative director for Karzoun Media Factory. Return only valid JSON. Design genuinely original, advertiser-friendly vertical Shorts with a clear viewer payoff. Never imitate an existing channel, copyrighted character, celebrity, logo, franchise style, or creator footage. Do not generate filler or near-duplicate shots. Factual claims must be conservative and verifiable. Kids-only content must remain age-appropriate, non-commercial, non-frightening, and must not encourage dangerous imitation or manipulative engagement.';

function creativePrompt(input: CreativeDirectorInput) {
  const minShots = Math.max(5, Math.ceil(input.durationSeconds / 6));
  return `Prepare a production plan for this ${input.durationSeconds}-second 9:16 Short.\nID: ${input.externalPromptId}\nChannel type: ${input.channelType}\nCategory: ${input.category}\nConcept: ${input.concept}\nSource prompt:\n${input.fullPrompt}\n\nReturn exactly this JSON shape: {"hook":"","script":"","title":"max 55 chars","description":"","hashtags":["#..."],"visualStyle":"","audioDirection":"","shots":[{"startSecond":0,"endSecond":5,"visualPrompt":"","camera":"","narration":""}],"safetyNotes":[""]}. Shots must cover the full duration in chronological order with no gaps or overlaps. Use at least ${minShots} materially different visual beats. Keep every field concise so the complete JSON fits comfortably in a small token budget. The first shot must communicate the hook immediately, the middle must escalate rather than repeat, and the final shot must deliver a real payoff and preferably a natural loop. Keep title/description truthful and avoid fake urgency or guaranteed-view language.`;
}

export function normalizeCreativeTitle(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length <= 55) return trimmed;

  const hardLimit = trimmed.slice(0, 55).trimEnd();
  const wordBoundary = hardLimit.lastIndexOf(' ');
  return wordBoundary >= 36 ? hardLimit.slice(0, wordBoundary).trimEnd() : hardLimit;
}

function normalizeCreativePayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return { ...record, title: normalizeCreativeTitle(record.title) };
}

function parseCreativePlan(text: string, durationSeconds: number) {
  if (!text) throw new Error('AI creative director returned no creative plan');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('AI creative director returned invalid JSON'); }
  const plan = creativePlanSchema.parse(normalizeCreativePayload(parsed));
  validateTimeline(plan, durationSeconds);
  return plan;
}

export class MockCreativeDirector implements CreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const shotCount = Math.max(5, Math.min(12, Math.ceil(input.durationSeconds / 5)));
    const shots = Array.from({ length: shotCount }, (_, index) => {
      const startSecond = Number(((input.durationSeconds * index) / shotCount).toFixed(2));
      const endSecond = Number(((input.durationSeconds * (index + 1)) / shotCount).toFixed(2));
      return {
        startSecond,
        endSecond,
        visualPrompt: `${input.fullPrompt}\nMock visual beat ${index + 1}/${shotCount}. Advance the story with a distinct composition, action and foreground/background relationship. Original imagery only.`,
        camera: index === 0 ? 'Immediate establishing hook into a controlled push-in.' : index === shotCount - 1 ? 'Resolve on a clean final composition that can loop into the opening.' : `Motivated shot ${index + 1}: vary scale and movement while preserving continuity.`,
        narration: ''
      };
    });

    return {
      model: 'mock-creative-director',
      plan: creativePlanSchema.parse({
        hook: `What happens if we visualize this: ${input.concept}?`,
        script: `This is a deterministic mock creative plan for ${input.concept}. It exercises pacing, continuity, review, scheduling and safety gates without calling an AI model or spending provider credits.`,
        title: input.concept.slice(0, 55),
        description: 'Mock-mode production plan. A live AI creative director replaces this only after it is explicitly enabled.',
        hashtags: ['#Shorts', '#Original', '#KarzounMediaLab'],
        visualStyle: 'Original cinematic vertical short, clean high-contrast composition, varied shot scale, no copyrighted characters or logos.',
        audioDirection: 'Original or licensed audio only. Clear narration when present and restrained sound design.',
        shots,
        safetyNotes: input.channelType === 'KIDS_CHANNEL_ONLY'
          ? ['Kids-only routing required.', 'Keep language calm, positive, non-commercial and age-appropriate.', 'Avoid realistic danger or imitable hazardous behavior.']
          : ['General-audience routing.', 'Keep the finished Short advertiser-friendly and original.']
      })
    };
  }
}

export class OpenAICreativeDirector implements CreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    if (!responsesProviderConfigured()) {
      const provider = selectedResponsesProvider();
      throw new Error(`${provider === 'groq' ? 'Groq' : 'OpenAI'} creative director credentials are missing`);
    }
    const model = selectedOpenAIModel();
    const response = await createOpenAIResponse({
      model,
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'low' },
      max_output_tokens: selectedResponsesProvider() === 'groq' ? 1800 : 3500,
      instructions: CREATIVE_SYSTEM,
      input: creativePrompt(input),
      text: { verbosity: 'low' }
    });
    return { model, plan: parseCreativePlan(getOpenAIOutputText(response), input.durationSeconds) };
  }
}

export class GroqCreativeDirector extends OpenAICreativeDirector {}

export class AnthropicCreativeDirector implements CreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const model = process.env.ANTHROPIC_MODEL;
    if (!process.env.ANTHROPIC_API_KEY || !model) throw new Error('Claude creative director is enabled but its environment configuration is incomplete');

    const client = new Anthropic();
    const message = await client.messages.create({
      model,
      max_tokens: 3000,
      system: CREATIVE_SYSTEM,
      messages: [{ role: 'user', content: creativePrompt(input) }]
    });

    const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n').trim();
    return { model, plan: parseCreativePlan(text, input.durationSeconds) };
  }
}

export function validateTimeline(plan: CreativePlan, durationSeconds: number) {
  const shots = plan.shots;
  if (Math.abs(shots[0].startSecond) > 0.01) throw new Error('Creative plan must start at second 0');
  for (let i = 0; i < shots.length; i++) {
    if (shots[i].endSecond <= shots[i].startSecond) throw new Error('Creative plan contains an invalid shot duration');
    if (i > 0 && Math.abs(shots[i].startSecond - shots[i - 1].endSecond) > 0.25) throw new Error('Creative plan timeline contains a gap or overlap');
  }
  if (Math.abs(shots[shots.length - 1].endSecond - durationSeconds) > 0.5) throw new Error('Creative plan does not cover the requested duration');
}

export function getCreativeDirector(): CreativeDirector {
  const provider = process.env.CREATIVE_DIRECTOR || 'mock';
  if (provider === 'openai') return new OpenAICreativeDirector();
  if (provider === 'groq') return new GroqCreativeDirector();
  if (provider === 'anthropic') return new AnthropicCreativeDirector();
  return new MockCreativeDirector();
}
