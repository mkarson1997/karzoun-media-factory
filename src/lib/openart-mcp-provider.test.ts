import { describe, expect, it } from 'vitest';
import { buildVideoParams, extractCreationId, extractOpenArtResultFacts, isPlausibleMediaUrl, rankOpenArtModelCandidates, validateOpenArtToolDiscovery } from './openart-mcp-provider';

function form(maximum = 15) {
  return {
    model: 'test-video', mode: 'text2video', media: 'video', defaults: {},
    jsonSchema: {
      allOf: [{
        type: 'object',
        properties: {
          prompt: { type: 'string', maxLength: 120 },
          videoCount: { type: 'integer', default: 1 },
          duration: { type: 'integer', minimum: 4, maximum, default: 5 },
          aspectRatio: { type: 'string', enum: ['16:9', '9:16'], default: '16:9' },
          generateAudio: { type: 'boolean', default: true },
          seed: { type: 'number', default: -1 }
        },
        required: ['prompt', 'videoCount', 'duration', 'aspectRatio', 'generateAudio', 'seed']
      }]
    }
  } as Parameters<typeof buildVideoParams>[0];
}

describe('direct OpenArt MCP adapter', () => {
  it('validates direct rendering tool discovery', () => {
    const result = validateOpenArtToolDiscovery([
      { name: 'openart_generate_video' }, { name: 'openart_creation_get' },
      { name: 'openart_model_list' }, { name: 'openart_model_form_get' }
    ]);
    expect(result.generationTool).toBe('openart_generate_video');
    expect(() => validateOpenArtToolDiscovery([{ name: 'openart_model_list' }])).toThrow(/missing required tools/i);
  });

  it('builds schema-valid vertical params and records clamped duration', () => {
    const built = buildVideoParams(form(15), JSON.stringify({ hook: 'Start', script: 'Tell a concise story', shots: [] }), 45);
    expect(built.actualDuration).toBe(15);
    expect(built.params).toMatchObject({ videoCount: 1, duration: 15, aspectRatio: '9:16', generateAudio: false, seed: -1 });
    expect(String(built.params.prompt).length).toBeLessThanOrEqual(120);
  });

  it('honors valid hints, then duration and cost', () => {
    const base = { vertical: 1, durationFit: 0, hintMatch: false };
    const ranked = rankOpenArtModelCandidates([
      { ...base, model: { id: 'cheap' }, actualDuration: 15, estimatedCredits: 50 },
      { ...base, model: { id: 'long' }, actualDuration: 30, estimatedCredits: 300 },
      { ...base, model: { id: 'hinted' }, actualDuration: 5, estimatedCredits: 500, hintMatch: true }
    ]);
    expect(ranked.map((item) => item.model.id)).toEqual(['hinted', 'long', 'cheap']);
  });

  it('extracts async identifiers, status, errors, and recursive media URLs', () => {
    const payload = { content: [{ type: 'text', text: JSON.stringify({ historyId: 'hist-123', status: 'COMPLETED', outputs: [{ video: { download_url: 'https://cdn.openart.ai/result/final.mp4' } }] }) }] };
    const facts = extractOpenArtResultFacts(payload);
    expect(extractCreationId(payload)).toBe('hist-123');
    expect(facts.status).toBe('COMPLETED');
    expect(facts.urls).toEqual(['https://cdn.openart.ai/result/final.mp4']);
  });

  it('rejects dashboard, auth, docs, and model URLs', () => {
    expect(isPlausibleMediaUrl('https://openart.ai/dashboard/creation/1', 'url')).toBe(false);
    expect(isPlausibleMediaUrl('https://mcp.openart.ai/mcp', 'url')).toBe(false);
    expect(isPlausibleMediaUrl('https://cdn.openart.ai/assets/video.mp4', 'url')).toBe(true);
  });
});
