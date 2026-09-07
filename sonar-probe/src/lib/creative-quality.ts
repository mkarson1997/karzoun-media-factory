import type { CreativePlan } from './creative-director';

export type CreativeQualityResult = {
  score: number;
  blocking: string[];
  warnings: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function evaluateCreativeQuality(plan: CreativePlan, input: { durationSeconds: number; channelType: 'GENERAL' | 'KIDS_CHANNEL_ONLY' }): CreativeQualityResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const minShots = Math.max(5, Math.ceil(input.durationSeconds / 6));

  if (plan.shots.length < minShots) {
    blocking.push(`Too few visual beats: ${plan.shots.length}; expected at least ${minShots} for ${input.durationSeconds}s`);
  }

  const uniqueVisuals = new Set(plan.shots.map((shot) => normalize(shot.visualPrompt))).size;
  const uniquenessRatio = uniqueVisuals / Math.max(1, plan.shots.length);
  if (uniquenessRatio < 0.7) blocking.push('Shot prompts are too repetitive');

  const scriptWords = plan.script.trim().split(/\s+/).filter(Boolean).length;
  if (scriptWords < 25) warnings.push('Script is unusually short for a complete Short');

  const hookWords = plan.hook.trim().split(/\s+/).filter(Boolean).length;
  if (hookWords > 30) warnings.push('Hook may be too long for the opening seconds');

  if (plan.title === plan.title.toUpperCase() && /[A-Z]/.test(plan.title)) warnings.push('Title is all caps');

  const combined = normalize([plan.hook, plan.script, plan.title, plan.description, ...plan.hashtags].join(' '));
  const manipulative = ['guaranteed viral', 'guaranteed views', 'you must subscribe', 'click the link now', 'limited time offer'];
  if (manipulative.some((phrase) => combined.includes(phrase))) blocking.push('Manipulative or fake engagement language detected');

  if (input.channelType === 'KIDS_CHANNEL_ONLY') {
    const commercialKidsPhrases = ['buy now', 'purchase now', 'ask your parents to buy', 'limited time offer', 'click the link', 'subscribe now'];
    if (commercialKidsPhrases.some((phrase) => combined.includes(phrase))) {
      blocking.push('Commercial call-to-action detected in kids content');
    }
    if (!plan.safetyNotes.some((note) => /kid|child|age|safe/i.test(note))) {
      warnings.push('Kids plan does not explicitly document an age/safety note');
    }
  }

  const warningPenalty = Math.min(20, warnings.length * 4);
  const blockingPenalty = Math.min(80, blocking.length * 30);
  const pacingBonus = Math.min(15, Math.max(0, plan.shots.length - minShots));
  const score = Math.max(0, Math.min(100, Math.round(85 + pacingBonus - warningPenalty - blockingPenalty)));

  return { score, blocking, warnings };
}
