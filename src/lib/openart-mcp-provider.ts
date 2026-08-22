import Anthropic from '@anthropic-ai/sdk';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoGenerationResult } from './providers';
import { getOpenArtAccessToken } from './openart-oauth';
import { createOpenAIResponse, selectedOpenAIModel } from './openai-responses';

const DEFAULT_OPENART_MCP_URL = 'https://mcp.openart.ai/mcp';
const MEDIA_URL_RE = /https:\/\/[^\s"'<>]+/g;

function selectedAiProvider() {
  return process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'anthropic');
}

async function requireOpenArtConfig() {
  const url = process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL;
  const allowPaid = process.env.ALLOW_PAID_GENERATION === 'true';
  const aiProvider = selectedAiProvider();

  if (!allowPaid) throw new Error('Paid generation is locked. Set ALLOW_PAID_GENERATION=true only when you intentionally want to spend provider credits');
  if (aiProvider === 'openai' && !process.env.OPENAI_API_KEY) throw new Error('OpenArt MCP via OpenAI requires OPENAI_API_KEY');
  if (aiProvider === 'anthropic' && (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL)) throw new Error('OpenArt MCP via Anthropic requires ANTHROPIC_API_KEY and ANTHROPIC_MODEL');
  if (!url.startsWith('https://')) throw new Error('OpenArt MCP URL must use HTTPS');

  const token = await getOpenArtAccessToken();
  if (!token) throw new Error('OpenArt MCP generation requires an OAuth credential. Import the MCP Inspector OAuth state or configure an access token');

  return { aiProvider, token, url };
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
  return urls.find((url) => /(openart|cdn|media|video|output|asset)/i.test(url));
}

function renderPrompt(input: VideoGenerationRequest, modelHint: string) {
  return `Render production job ${input.jobId}.\nTarget duration: ${input.durationSeconds} seconds.\nAspect ratio: 9:16 vertical.\nModel preference: ${modelHint}\n\nCreative production plan:\n${input.prompt}\n\nUse OpenArt MCP tools to generate the finished video. If a single generation cannot cover the full requested duration, use the provider's supported continuation/extension workflow while preserving continuity. Return the completed asset from OpenArt.`;
}

const RENDER_SYSTEM = 'You are the rendering operator for Karzoun Media Factory. Use the connected OpenArt MCP tools to create exactly one original vertical video from the supplied production brief. Do not imitate copyrighted characters, channels, celebrities, logos, or creator footage. Use only original or properly generated media. Wait for the OpenArt generation result when the tool supports it. Do not claim success unless the tool actually returns a completed asset.';

async function generateViaOpenAI(input: VideoGenerationRequest, token: string, url: string, modelHint: string) {
  const model = selectedOpenAIModel();
  const response = await createOpenAIResponse({
    model,
    reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'low' },
    max_output_tokens: 2200,
    instructions: RENDER_SYSTEM,
    input: renderPrompt(input, modelHint),
    tools: [{
      type: 'mcp',
      server_label: 'openart',
      server_url: url,
      authorization: token,
      require_approval: 'never'
    }],
    tool_choice: 'required',
    text: { verbosity: 'low' }
  });
  return { id: typeof response.id === 'string' ? response.id : `openai-${input.jobId}`, payload: response };
}

async function generateViaAnthropic(input: VideoGenerationRequest, token: string, url: string, modelHint: string) {
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) throw new Error('ANTHROPIC_MODEL is missing');
  const client = new Anthropic();
  const message = await client.beta.messages.create({
    model,
    max_tokens: 1800,
    betas: ['mcp-client-2025-11-20'],
    mcp_servers: [{ type: 'url', url, name: 'openart', authorization_token: token }],
    tools: [{ type: 'mcp_toolset', mcp_server_name: 'openart' }],
    system: RENDER_SYSTEM,
    messages: [{ role: 'user', content: renderPrompt(input, modelHint) }]
  } as never);
  return { id: message.id, payload: message };
}

export class OpenArtMcpVideoProvider implements VideoGenerationProvider {
  async generateVideo(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const { aiProvider, token, url } = await requireOpenArtConfig();
    const modelHint = process.env.VIDEO_MODEL_HINT || 'Choose the best currently available OpenArt video model for this brief.';
    const result = aiProvider === 'openai'
      ? await generateViaOpenAI(input, token, url, modelHint)
      : await generateViaAnthropic(input, token, url, modelHint);

    const videoUrl = chooseVideoUrl(collectUrls(result.payload));
    if (!videoUrl) throw new Error(`OpenArt MCP via ${aiProvider} completed without a usable video asset URL`);

    return { providerJobId: result.id, status: 'READY_FOR_REVIEW', videoUrl };
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenerationResult> {
    throw new Error(`OpenArt MCP job ${providerJobId} is not pollable by this adapter; generation is completed inside the MCP request`);
  }

  async cancelJob(): Promise<void> {
    // The current adapter runs one bounded MCP request and has no provider-level cancel handle.
  }
}

export function openArtMcpStatus() {
  const aiProvider = selectedAiProvider();
  const aiConfigured = aiProvider === 'openai'
    ? Boolean(process.env.OPENAI_API_KEY)
    : Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL);
  return {
    configured: aiConfigured && Boolean(process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL),
    aiProvider,
    paidGenerationUnlocked: process.env.ALLOW_PAID_GENERATION === 'true',
    serverUrl: process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL,
    modelHint: process.env.VIDEO_MODEL_HINT || null
  };
}
