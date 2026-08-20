import Anthropic from '@anthropic-ai/sdk';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoGenerationResult } from './providers';

const DEFAULT_OPENART_MCP_URL = 'https://mcp.openart.ai/mcp';
const MEDIA_URL_RE = /https:\/\/[^\s"'<>]+/g;

function requireOpenArtConfig() {
  const model = process.env.ANTHROPIC_MODEL;
  const token = process.env.OPENART_MCP_ACCESS_TOKEN;
  const url = process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL;
  const allowPaid = process.env.ALLOW_PAID_GENERATION === 'true';

  if (!allowPaid) throw new Error('Paid generation is locked. Set ALLOW_PAID_GENERATION=true only when you intentionally want to spend provider credits');
  if (!process.env.ANTHROPIC_API_KEY || !model) throw new Error('OpenArt MCP generation requires ANTHROPIC_API_KEY and ANTHROPIC_MODEL');
  if (!token) throw new Error('OpenArt MCP generation requires an OAuth access token');
  if (!url.startsWith('https://')) throw new Error('OpenArt MCP URL must use HTTPS');

  return { model, token, url };
}

function collectUrls(value: unknown, found = new Set<string>()): string[] {
  if (typeof value === 'string') {
    for (const match of value.match(MEDIA_URL_RE) ?? []) found.add(match.replace(/[),.;]+$/, ''));
    return [...found];
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, found);
    return [...found];
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectUrls(item, found);
  }
  return [...found];
}

function chooseVideoUrl(urls: string[]) {
  const direct = urls.find((url) => /\.(mp4|webm|mov)(?:\?|$)/i.test(url));
  if (direct) return direct;
  const likelyMedia = urls.find((url) => /(openart|cdn|media|video|output|asset)/i.test(url));
  return likelyMedia;
}

export class OpenArtMcpVideoProvider implements VideoGenerationProvider {
  async generateVideo(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const { model, token, url } = requireOpenArtConfig();
    const client = new Anthropic();
    const modelHint = process.env.VIDEO_MODEL_HINT || 'Choose the best currently available OpenArt video model for this brief.';

    const message = await client.beta.messages.create({
      model,
      max_tokens: 1800,
      betas: ['mcp-client-2025-11-20'],
      mcp_servers: [{
        type: 'url',
        url,
        name: 'openart',
        authorization_token: token
      }],
      tools: [{
        type: 'mcp_toolset',
        mcp_server_name: 'openart'
      }],
      system: 'You are the rendering operator for Karzoun Media Factory. Use the connected OpenArt MCP tools to create exactly one original vertical video from the supplied production brief. Do not imitate copyrighted characters, channels, celebrities, logos, or creator footage. Use only original or properly generated media. Wait for the OpenArt generation result when the tool supports it. Do not claim success unless the tool actually returns a completed asset.',
      messages: [{
        role: 'user',
        content: `Render production job ${input.jobId}.\nTarget duration: ${input.durationSeconds} seconds.\nAspect ratio: 9:16 vertical.\nModel preference: ${modelHint}\n\nCreative production plan:\n${input.prompt}\n\nUse OpenArt MCP tools to generate the finished video. If a single generation cannot cover the full requested duration, use the provider's supported continuation/extension workflow while preserving continuity. Return the completed asset from OpenArt.`
      }]
    } as never);

    const urls = collectUrls(message.content);
    const videoUrl = chooseVideoUrl(urls);
    if (!videoUrl) {
      throw new Error('OpenArt MCP completed without a usable video asset URL');
    }

    return {
      providerJobId: message.id,
      status: 'READY_FOR_REVIEW',
      videoUrl
    };
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenerationResult> {
    throw new Error(`OpenArt MCP job ${providerJobId} is not pollable by this adapter; generation is completed inside the MCP request`);
  }

  async cancelJob(): Promise<void> {
    // The current adapter runs one bounded MCP request and has no provider-level cancel handle.
  }
}

export function openArtMcpStatus() {
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL && process.env.OPENART_MCP_ACCESS_TOKEN),
    paidGenerationUnlocked: process.env.ALLOW_PAID_GENERATION === 'true',
    serverUrl: process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL,
    modelHint: process.env.VIDEO_MODEL_HINT || null
  };
}
