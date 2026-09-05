import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { createOpenAIResponse, getOpenAIOutputText, responsesProviderConfigured, selectedOpenAIModel } from './openai-responses';
import { trustedOllamaUrl } from './ollama-network-policy';
import { assertExternalCreativeAllowed, zeroCostMode } from './zero-cost';

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

export class DeterministicCreativeDirector implements CreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const shotCount = Math.max(5, Math.min(12, Math.ceil(input.durationSeconds / 5)));
    const shots = Array.from({ length: shotCount }, (_, index) => {
      const startSecond = Number(((input.durationSeconds * index) / shotCount).toFixed(2));
      const endSecond = Number(((input.durationSeconds * (index + 1)) / shotCount).toFixed(2));
      return {
        startSecond,
        endSecond,
        visualPrompt: `${input.fullPrompt}\nVisual beat ${index + 1}/${shotCount}: ${index === 0 ? 'open with an unmistakable visual hook' : index === shotCount - 1 ? 'deliver the payoff and compose a clean visual loop' : 'advance the idea with a new action, scale and foreground/background relationship'}. Original imagery only, vertical 9:16, no logos or copyrighted characters.`,
        camera: index === 0 ? 'Immediate establishing hook into a controlled push-in.' : index === shotCount - 1 ? 'Resolve on a clean final composition that can loop into the opening.' : `Motivated shot ${index + 1}: vary scale and movement while preserving continuity.`,
        narration: ''
      };
    });

    return {
      model: 'deterministic-local',
      plan: creativePlanSchema.parse({
        hook: `See ${input.concept} unfold in one clear visual story.`,
        script: `${input.fullPrompt} Open immediately on the central idea, build it through distinct visual beats, and finish with a clear, truthful payoff that naturally returns to the opening image. Keep every scene original, easy to understand without context, and paced for a ${input.durationSeconds}-second vertical Short.`,
        title: input.concept.slice(0, 55),
        description: `An original ${input.category.toLowerCase()} short about ${input.concept}.`,
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

export class MockCreativeDirector extends DeterministicCreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const result = await super.prepare(input);
    return { ...result, model: 'mock-creative-director' };
  }
}

export class OpenAICreativeDirector implements CreativeDirector {
  constructor(private readonly responsesProvider: 'openai' | 'groq' = 'openai') {}

  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    assertExternalCreativeAllowed(this.responsesProvider);
    if (!responsesProviderConfigured(process.env, this.responsesProvider)) {
      const provider = this.responsesProvider;
      throw new Error(`${provider === 'groq' ? 'Groq' : 'OpenAI'} creative director credentials are missing`);
    }
    const model = selectedOpenAIModel(this.responsesProvider);
    const response = await createOpenAIResponse({
      model,
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'low' },
      max_output_tokens: this.responsesProvider === 'groq' ? 1800 : 3500,
      instructions: CREATIVE_SYSTEM,
      input: creativePrompt(input),
      text: { verbosity: 'low' }
    }, this.responsesProvider, { maxAttempts: 1 });
    return { model, plan: parseCreativePlan(getOpenAIOutputText(response), input.durationSeconds) };
  }
}

export class GroqCreativeDirector extends OpenAICreativeDirector {
  constructor() { super('groq'); }
}

export class AnthropicCreativeDirector implements CreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    assertExternalCreativeAllowed('anthropic');
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

type FetchLike = typeof fetch;

export type OllamaModelInfo = { name?: string; model?: string; remote_model?: string; size?: number };

export function isLocalOllamaModel(model: OllamaModelInfo) {
  const name = model.name || model.model || '';
  return Boolean(name && !model.remote_model && !name.endsWith(':cloud') && !/embed/i.test(name) && (model.size ?? 0) > 1_000_000);
}

export class OllamaCreativeDirector implements CreativeDirector {
  constructor(private readonly request: FetchLike = fetch) {}

  private async selectModel() {
    const response = await this.request(trustedOllamaUrl('/api/tags', process.env.OLLAMA_BASE_URL), { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Ollama model discovery returned HTTP ${response.status}`);
    const payload = await response.json() as { models?: OllamaModelInfo[] };
    const localModels = payload.models?.filter(isLocalOllamaModel) ?? [];
    const configured = process.env.OLLAMA_MODEL?.trim();
    if (configured) {
      const match = localModels.find((item) => (item.name || item.model) === configured);
      if (!match) throw new Error(`Configured Ollama model ${configured} is not a local, non-embedding model`);
      return configured;
    }
    const model = localModels.map((item) => item.name || item.model).find(Boolean);
    if (!model) throw new Error('Ollama is running but no local generation model is installed');
    return model;
  }

  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const model = await this.selectModel();
    const response = await this.request(trustedOllamaUrl('/api/generate', process.env.OLLAMA_BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, system: CREATIVE_SYSTEM, prompt: creativePrompt(input), stream: false, format: 'json', options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(Number(process.env.OLLAMA_TIMEOUT_MS || 30000))
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const payload = await response.json() as { response?: string };
    return { model: `ollama/${model}`, plan: parseCreativePlan(payload.response || '', input.durationSeconds) };
  }
}

export class ZeroCostCreativeDirector implements CreativeDirector {
  constructor(private readonly ollama: CreativeDirector = new OllamaCreativeDirector()) {}

  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    try {
      return await this.ollama.prepare(input);
    } catch (error) {
      console.warn(`Local Ollama unavailable; using deterministic fallback: ${conciseError(error)}`);
      return new DeterministicCreativeDirector().prepare(input);
    }
  }
}

function remoteDirector(provider: string): CreativeDirector | null {
  if (provider === 'openai') return new OpenAICreativeDirector();
  if (provider === 'groq') return new GroqCreativeDirector();
  if (provider === 'anthropic') return new AnthropicCreativeDirector();
  return null;
}

function conciseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(?:sk-|gsk_|Bearer\s+)[A-Za-z0-9._-]+/gi, '[redacted]').slice(0, 240);
}

export class ResilientCreativeDirector implements CreativeDirector {
  constructor(private readonly primary: string, private readonly fallback?: string) {}

  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const providers = [...new Set([this.primary, this.fallback].filter((value): value is string => Boolean(value)))];
    for (const provider of providers) {
      const director = remoteDirector(provider);
      if (!director) continue;
      try {
        return await director.prepare(input);
      } catch (error) {
        console.warn(`Creative director ${provider} unavailable; continuing with fallback: ${conciseError(error)}`);
      }
    }
    return new DeterministicCreativeDirector().prepare(input);
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
  if (zeroCostMode()) return new ZeroCostCreativeDirector();
  const provider = process.env.CREATIVE_DIRECTOR || 'mock';
  if (remoteDirector(provider)) return new ResilientCreativeDirector(provider, process.env.CREATIVE_DIRECTOR_FALLBACK);
  return new MockCreativeDirector();
}
