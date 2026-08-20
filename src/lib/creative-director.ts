import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

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

export class MockCreativeDirector implements CreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const split = Math.max(12, Math.floor(input.durationSeconds * 0.55));
    return {
      model: 'mock-creative-director',
      plan: creativePlanSchema.parse({
        hook: `What happens if we visualize this: ${input.concept}?`,
        script: `This is a mock creative plan for ${input.concept}. It proves the factory workflow without calling an AI model or spending credits.`,
        title: input.concept.slice(0, 55),
        description: 'Mock-mode production plan. Claude can replace this only after the creative director is explicitly enabled.',
        hashtags: ['#Shorts', '#AI', '#KarzounMediaLab'],
        visualStyle: 'Original cinematic vertical short, clean high-contrast composition, no copyrighted characters or logos.',
        audioDirection: 'Original or licensed audio only. Clear narration and restrained sound design.',
        shots: [
          { startSecond: 0, endSecond: split, visualPrompt: `${input.fullPrompt}\nOpening section. Strong visual hook. Original imagery only.`, camera: 'Fast establishing move into a controlled push-in.', narration: '' },
          { startSecond: split, endSecond: input.durationSeconds, visualPrompt: `${input.fullPrompt}\nPayoff section. Resolve the idea and create a seamless loop.`, camera: 'Motivated close-ups followed by a clean looping final frame.', narration: '' }
        ],
        safetyNotes: input.channelType === 'KIDS_CHANNEL_ONLY' ? ['Kids-only routing required.', 'Keep language calm, positive and age-appropriate.'] : ['General-audience routing.']
      })
    };
  }
}

export class AnthropicCreativeDirector implements CreativeDirector {
  async prepare(input: CreativeDirectorInput): Promise<CreativeDirectorResult> {
    const model = process.env.ANTHROPIC_MODEL;
    if (!process.env.ANTHROPIC_API_KEY || !model) throw new Error('Claude creative director is enabled but its environment configuration is incomplete');

    const client = new Anthropic();
    const message = await client.messages.create({
      model,
      max_tokens: 2200,
      temperature: 0.5,
      system: 'You are the creative director for Karzoun Media Factory. Return only valid JSON. Design original, advertiser-friendly vertical Shorts. Never imitate an existing channel, copyrighted character, celebrity, logo, or creator footage. Factual claims must be conservative and verifiable. Kids-only content must remain age-appropriate and non-commercial.',
      messages: [{
        role: 'user',
        content: `Prepare a production plan for this ${input.durationSeconds}-second 9:16 Short.\nID: ${input.externalPromptId}\nChannel type: ${input.channelType}\nCategory: ${input.category}\nConcept: ${input.concept}\nSource prompt:\n${input.fullPrompt}\n\nReturn exactly this JSON shape: {"hook":"","script":"","title":"max 55 chars","description":"","hashtags":["#..."],"visualStyle":"","audioDirection":"","shots":[{"startSecond":0,"endSecond":5,"visualPrompt":"","camera":"","narration":""}],"safetyNotes":[""]}. Shots must cover the full duration in chronological order.`
      }]
    });

    const text = message.content.filter((item) => item.type === 'text').map((item) => item.text).join('\n').trim();
    if (!text) throw new Error('Claude returned no creative plan');

    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new Error('Claude returned invalid JSON'); }
    const plan = creativePlanSchema.parse(parsed);
    validateTimeline(plan, input.durationSeconds);
    return { model, plan };
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
  return process.env.CREATIVE_DIRECTOR === 'anthropic' ? new AnthropicCreativeDirector() : new MockCreativeDirector();
}
