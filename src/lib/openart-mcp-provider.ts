import Anthropic from '@anthropic-ai/sdk';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoGenerationResult } from './providers';
import { getOpenArtAccessToken } from './openart-oauth';
import { createOpenAIResponse, selectedOpenAIModel } from './openai-responses';
import { openSafeRemoteMedia } from './remote-media';

const DEFAULT_OPENART_MCP_URL = 'https://mcp.openart.ai/mcp';
const MEDIA_URL_RE = /https:\/\/[^\s"'<>]+/g;

type JsonRecord = Record<string, unknown>;

function selectedAiProvider() {
  return process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : process.env.OPENAI_API_KEY ? 'openai' : 'anthropic');
}

async function requireOpenArtConfig() {
  const url = process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL;
  const allowPaid = process.env.ALLOW_PAID_GENERATION === 'true';
  const aiProvider = selectedAiProvider();

  if (!allowPaid) throw new Error('Paid generation is locked. Set ALLOW_PAID_GENERATION=true only when you intentionally want to spend provider credits');
  if (aiProvider === 'groq' && !process.env.GROQ_API_KEY) throw new Error('OpenArt MCP via Groq requires GROQ_API_KEY');
  if (aiProvider === 'openai' && !process.env.OPENAI_API_KEY) throw new Error('OpenArt MCP via OpenAI requires OPENAI_API_KEY');
  if (aiProvider === 'anthropic' && (!process.env.ANTHROPIC_API_KEY || !process.env.ANTHROPIC_MODEL)) throw new Error('OpenArt MCP via Anthropic requires ANTHROPIC_API_KEY and ANTHROPIC_MODEL');
  if (!['groq', 'openai', 'anthropic'].includes(aiProvider)) throw new Error(`Unsupported AI bridge: ${aiProvider}`);
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
    for (const item of Object.values(value as JsonRecord)) collectUrls(item, found);
  }
  return [...found];
}

function getMcpCalls(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [] as JsonRecord[];
  const output = (payload as JsonRecord).output;
  if (!Array.isArray(output)) return [] as JsonRecord[];
  return output.filter((item): item is JsonRecord => Boolean(item && typeof item === 'object' && (item as JsonRecord).type === 'mcp_call'));
}

function collectUrlsFromMcpCalls(calls: JsonRecord[]) {
  const found = new Set<string>();
  for (const call of calls) {
    // Only inspect provider-returned MCP result fields. Never scrape the whole
    // Responses payload because it also contains the MCP server URL and prompt.
    collectUrls(call.output, found);
    collectUrls(call.result, found);
    collectUrls(call.content, found);
  }
  return [...found];
}

function chooseVideoUrl(urls: string[], mcpServerUrl: string) {
  const server = mcpServerUrl.replace(/\/$/, '');
  const candidates = urls.filter((url) => {
    const normalized = url.replace(/\/$/, '');
    if (normalized === server) return false;
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/mcp' || parsed.pathname.endsWith('/mcp')) return false;
    } catch {
      return false;
    }
    return true;
  });

  const direct = candidates.find((url) => /\.(mp4|webm|mov)(?:\?|$)/i.test(url));
  if (direct) return direct;
  return candidates.find((url) => /(cdn|media|video|output|asset|download|generation)/i.test(url));
}

async function verifyPlayableVideoUrl(rawUrl: string) {
  const media = await openSafeRemoteMedia(rawUrl);
  media.stream.destroy();
  return media.finalUrl;
}

function renderPrompt(input: VideoGenerationRequest, modelHint: string) {
  return `Render production job ${input.jobId}.\nTarget duration: ${input.durationSeconds} seconds.\nAspect ratio: 9:16 vertical.\nModel preference: ${modelHint}\n\nCreative production plan:\n${input.prompt}\n\nYou MUST use the OpenArt MCP server to generate the finished video. Do not answer with instructions, documentation links, the MCP server URL, or a hypothetical result. If a single generation cannot cover the full requested duration, use the provider's supported continuation/extension workflow while preserving continuity. Continue using OpenArt tools until a completed video asset is returned.`;
}

const RENDER_SYSTEM = 'You are the rendering operator for Karzoun Media Factory. You must execute at least one connected OpenArt MCP tool for every render request. Create exactly one original vertical video from the supplied production brief. Do not imitate copyrighted characters, channels, celebrities, logos, or creator footage. Use only original or properly generated media. Wait for OpenArt generation to complete when the tools support it. Never claim success from tool discovery, documentation, a server URL, or a textual answer. Success requires a completed playable video asset returned by an OpenArt MCP tool.';

async function generateViaOpenAICompatible(input: VideoGenerationRequest, token: string, url: string, modelHint: string) {
  const model = selectedOpenAIModel();
  const groq = selectedAiProvider() === 'groq';
  const mcpTool = groq
    ? {
        type: 'mcp',
        server_label: 'openart',
        server_description: 'OpenArt image and video generation tools. Use this server to generate the requested finished vertical video and return the completed media asset.',
        server_url: url,
        headers: { Authorization: `Bearer ${token}` },
        require_approval: 'never'
      }
    : {
        type: 'mcp',
        server_label: 'openart',
        server_url: url,
        authorization: token,
        require_approval: 'never'
      };

  const payload: Record<string, unknown> = {
    model,
    reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'low' },
    max_output_tokens: groq ? 1200 : 2200,
    instructions: RENDER_SYSTEM,
    input: renderPrompt(input, modelHint),
    tools: [mcpTool],
    tool_choice: 'required'
  };
  if (!groq) payload.text = { verbosity: 'low' };

  const response = await createOpenAIResponse(payload);
  const prefix = groq ? 'groq' : 'openai';
  return { id: typeof response.id === 'string' ? response.id : `${prefix}-${input.jobId}`, payload: response };
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
    const result = aiProvider === 'anthropic'
      ? await generateViaAnthropic(input, token, url, modelHint)
      : await generateViaOpenAICompatible(input, token, url, modelHint);

    let urls: string[];
    if (aiProvider === 'anthropic') {
      urls = collectUrls(result.payload);
    } else {
      const mcpCalls = getMcpCalls(result.payload);
      if (!mcpCalls.length) {
        throw new Error(`OpenArt MCP via ${aiProvider} returned no MCP tool execution. The render was not started and no video should be marked ready.`);
      }
      urls = collectUrlsFromMcpCalls(mcpCalls);
      if (!urls.length) {
        throw new Error(`OpenArt MCP via ${aiProvider} executed ${mcpCalls.length} MCP call(s) but returned no media URL. The render is not complete.`);
      }
    }

    const candidateUrl = chooseVideoUrl(urls, url);
    if (!candidateUrl) throw new Error(`OpenArt MCP via ${aiProvider} completed without a usable video asset URL`);

    let videoUrl: string;
    try {
      videoUrl = await verifyPlayableVideoUrl(candidateUrl);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown media validation error';
      throw new Error(`OpenArt MCP returned a non-playable media URL: ${reason}`);
    }

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
  const aiConfigured = aiProvider === 'groq'
    ? Boolean(process.env.GROQ_API_KEY)
    : aiProvider === 'openai'
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
