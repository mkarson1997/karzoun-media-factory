import Anthropic from '@anthropic-ai/sdk';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoGenerationResult } from './providers';
import { getOpenArtAccessToken } from './openart-oauth';
import { createOpenAIResponse, selectedOpenAIModel } from './openai-responses';
import { openSafeRemoteMedia } from './remote-media';

const DEFAULT_OPENART_MCP_URL = 'https://mcp.openart.ai/mcp';
const DEFAULT_GROQ_MCP_MODEL = 'qwen/qwen3.6-27b';
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

function getResponseMessages(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [] as JsonRecord[];
  const output = (payload as JsonRecord).output;
  if (!Array.isArray(output)) return [] as JsonRecord[];
  return output.filter((item): item is JsonRecord => Boolean(item && typeof item === 'object' && (item as JsonRecord).type === 'message'));
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

function collectUrlsFromResponseMessages(payload: unknown) {
  const found = new Set<string>();
  for (const message of getResponseMessages(payload)) {
    // Groq's server-side MCP orchestration may put the finished asset URL only
    // in the final assistant message after it has consumed the MCP tool output.
    // Scanning message content is safe because the MCP server definition and
    // original prompt live outside these message items.
    collectUrls(message.content, found);
  }
  return [...found];
}

function videoUrlCandidates(urls: string[], mcpServerUrl: string) {
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

  const direct = candidates.filter((url) => /\.(mp4|webm|mov)(?:\?|$)/i.test(url));
  const likely = candidates.filter((url) => !direct.includes(url) && /(cdn|media|video|output|asset|download|generation)/i.test(url));
  return [...direct, ...likely];
}

async function verifyPlayableVideoUrl(rawUrl: string) {
  const media = await openSafeRemoteMedia(rawUrl);
  media.stream.destroy();
  return media.finalUrl;
}

async function findPlayableVideoUrl(urls: string[], mcpServerUrl: string) {
  const candidates = videoUrlCandidates(urls, mcpServerUrl);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      return await verifyPlayableVideoUrl(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('unknown media validation error');
    }
  }

  if (!candidates.length) return null;
  throw new Error(`OpenArt returned ${candidates.length} candidate media URL(s), but none were playable: ${lastError?.message || 'unknown media validation error'}`);
}

function renderPrompt(input: VideoGenerationRequest, modelHint: string, retry = false) {
  const retryInstruction = retry
    ? '\nMANDATORY RETRY: The previous model response did not execute an MCP tool. Do not return any explanatory text first. Discover the OpenArt MCP tools and immediately call the appropriate video-generation tool. A response without an MCP call is a failure.'
    : '';

  return `Render production job ${input.jobId}.\nTarget duration: ${input.durationSeconds} seconds.\nAspect ratio: 9:16 vertical.\nModel preference: ${modelHint}\n\nCreative production plan:\n${input.prompt}\n\nYou MUST use the OpenArt MCP server to generate the finished video. Do not answer with instructions, documentation links, the MCP server URL, or a hypothetical result. If a single generation cannot cover the full requested duration, use the provider's supported continuation/extension workflow while preserving continuity. Continue using OpenArt tools until a completed video asset is returned. When OpenArt returns the finished asset, include its direct downloadable/video URL in your final response so the factory can validate it.${retryInstruction}`;
}

const RENDER_SYSTEM = 'You are the rendering operator for Karzoun Media Factory. You must execute at least one connected OpenArt MCP tool for every render request. Create exactly one original vertical video from the supplied production brief. Do not imitate copyrighted characters, channels, celebrities, logos, or creator footage. Use only original or properly generated media. Wait for OpenArt generation to complete when the tools support it. Never claim success from tool discovery, documentation, a server URL, or a textual answer. Success requires a completed playable video asset returned by an OpenArt MCP tool. After completion, expose the finished asset direct URL in the final response so the factory can validate and review it.';

async function generateViaOpenAICompatible(input: VideoGenerationRequest, token: string, url: string, modelHint: string) {
  const groq = selectedAiProvider() === 'groq';
  const model = groq
    ? process.env.GROQ_MCP_MODEL || DEFAULT_GROQ_MCP_MODEL
    : selectedOpenAIModel();
  const mcpTool = groq
    ? {
        type: 'mcp',
        server_label: 'openart',
        server_description: 'OpenArt production tools for creating actual images and videos. For this request, discover and execute the video-generation tool, wait for completion, and return the completed video asset direct URL. Do not answer without calling OpenArt.',
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

  const attempts = groq ? 2 : 1;
  let lastResponse: Record<string, unknown> | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const payload: Record<string, unknown> = {
      model,
      reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'low' },
      max_output_tokens: groq ? 1000 : 2200,
      instructions: RENDER_SYSTEM,
      input: renderPrompt(input, modelHint, attempt > 1),
      tools: [mcpTool]
    };

    // Groq documents remote MCP with automatic tool selection. Forcing
    // tool_choice="required" can return HTTP 400 when the model declines to
    // call a dynamically discovered MCP tool. We instead verify that an MCP
    // call actually happened and retry once with stronger steering.
    if (!groq) {
      payload.tool_choice = 'required';
      payload.text = { verbosity: 'low' };
    }

    const response = await createOpenAIResponse(payload);
    lastResponse = response;
    if (!groq || getMcpCalls(response).length > 0) {
      const prefix = groq ? 'groq' : 'openai';
      return { id: typeof response.id === 'string' ? response.id : `${prefix}-${input.jobId}`, payload: response };
    }

    console.warn(`Groq MCP bridge returned no OpenArt tool call (${attempt}/${attempts}). Retrying with stronger tool-use instructions.`);
  }

  const prefix = groq ? 'groq' : 'openai';
  return {
    id: typeof lastResponse?.id === 'string' ? lastResponse.id : `${prefix}-${input.jobId}`,
    payload: lastResponse ?? {}
  };
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
        throw new Error(`OpenArt MCP via ${aiProvider} returned no MCP tool execution after automatic retry. The render was not started and no OpenArt credits should have been spent.`);
      }

      urls = [...new Set([
        ...collectUrlsFromMcpCalls(mcpCalls),
        ...collectUrlsFromResponseMessages(result.payload)
      ])];

      if (!urls.length) {
        const names = [...new Set(mcpCalls.map((call) => typeof call.name === 'string' ? call.name : null).filter((name): name is string => Boolean(name)))];
        const status = result.payload && typeof result.payload === 'object' && typeof (result.payload as JsonRecord).status === 'string'
          ? String((result.payload as JsonRecord).status)
          : 'unknown';
        const calls = names.length ? ` Tools: ${names.slice(0, 8).join(', ')}.` : '';
        throw new Error(`OpenArt MCP via ${aiProvider} executed ${mcpCalls.length} MCP call(s) but returned no media URL in either tool results or the final assistant message. Response status: ${status}.${calls} The render is not complete.`);
      }
    }

    let videoUrl: string | null;
    try {
      videoUrl = await findPlayableVideoUrl(urls, url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown media validation error';
      throw new Error(`OpenArt MCP media validation failed: ${reason}`);
    }

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
