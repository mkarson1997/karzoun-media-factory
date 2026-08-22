import Anthropic from '@anthropic-ai/sdk';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoGenerationResult } from './providers';
import { getOpenArtAccessToken } from './openart-oauth';
import { createOpenAIResponse, selectedOpenAIModel } from './openai-responses';
import { openSafeRemoteMedia } from './remote-media';

const DEFAULT_OPENART_MCP_URL = 'https://mcp.openart.ai/mcp';
const DEFAULT_GROQ_MCP_MODEL = 'qwen/qwen3.6-27b';
const MEDIA_URL_RE = /https:\/\/[^\s"'<>]+/g;
const WRITE_TOOL_RE = /(generate|generation|render|create|submit|execute|run|start|animate|upload|delete|update|edit)/i;
const EXECUTION_TOOL_RE = /(generate|generation|render|video|submit|execute|run|start|animate|status|result|job|task|poll|wait)/i;

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

function responseOutput(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [] as JsonRecord[];
  const output = (payload as JsonRecord).output;
  if (!Array.isArray(output)) return [] as JsonRecord[];
  return output.filter((item): item is JsonRecord => Boolean(item && typeof item === 'object'));
}

function getMcpCalls(payload: unknown) {
  return responseOutput(payload).filter((item) => item.type === 'mcp_call');
}

function getMcpListedTools(payload: unknown) {
  const tools: JsonRecord[] = [];
  for (const item of responseOutput(payload)) {
    if (item.type !== 'mcp_list_tools' || !Array.isArray(item.tools)) continue;
    for (const tool of item.tools) {
      if (tool && typeof tool === 'object') tools.push(tool as JsonRecord);
    }
  }
  return tools;
}

function getResponseMessages(payload: unknown) {
  return responseOutput(payload).filter((item) => item.type === 'message');
}

function getResponseStatus(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'unknown';
  const status = (payload as JsonRecord).status;
  return typeof status === 'string' ? status : 'unknown';
}

function getIncompleteDetail(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const details = (payload as JsonRecord).incomplete_details;
  if (!details || typeof details !== 'object') return null;
  const record = details as JsonRecord;
  const reason = record.reason;
  return typeof reason === 'string' ? reason : JSON.stringify(details).slice(0, 180);
}

function mcpCallNames(calls: JsonRecord[]) {
  return [...new Set(calls.map((call) => typeof call.name === 'string' ? call.name : null).filter((name): name is string => Boolean(name)))];
}

function callsAreReadOnly(calls: JsonRecord[]) {
  const names = mcpCallNames(calls);
  return names.length > 0 && names.every((name) => !WRITE_TOOL_RE.test(name));
}

function collectUrlsFromMcpCalls(calls: JsonRecord[]) {
  const found = new Set<string>();
  for (const call of calls) {
    collectUrls(call.output, found);
    collectUrls(call.result, found);
    collectUrls(call.content, found);
  }
  return [...found];
}

function collectUrlsFromResponseMessages(payload: unknown) {
  const found = new Set<string>();
  for (const message of getResponseMessages(payload)) collectUrls(message.content, found);
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
    ? '\nRETRY: A prior safe attempt only read OpenArt metadata and did not start a render. Do not browse projects or repeat unnecessary discovery. Use the available generation tools now, start exactly one video render, then wait/poll as supported until the finished asset URL is returned.'
    : '';

  return `Create one finished OpenArt video for job ${input.jobId}.\nDuration: ${input.durationSeconds}s. Aspect: 9:16.\nModel preference: ${modelHint}\nBrief: ${input.prompt}\nUse only the OpenArt MCP tools exposed for this run. Do not list projects unless a tool explicitly requires a project id. Model discovery/form lookup is setup only. Start exactly one generation, then wait/poll as supported until completion. Return the direct finished video/download URL.${retryInstruction}`;
}

const RENDER_SYSTEM = 'You operate OpenArt MCP for Karzoun Media Factory. Produce exactly one original vertical video. Be action-first and terse. Do not wander through projects or account data. Model/form discovery is setup only. Execute exactly one video-generation action, then completion/status checks as needed. Never claim success without a completed playable video asset URL. Avoid copyrighted characters, celebrities, logos, franchises, or copied creator footage.';

function groqOutputBudget(attempt: number) {
  const configured = Number(process.env.GROQ_MCP_MAX_OUTPUT_TOKENS);
  if (Number.isFinite(configured) && configured >= 1800 && configured <= 6000) return Math.floor(configured);
  return attempt > 1 ? 3000 : 2400;
}

function toolName(tool: JsonRecord) {
  return typeof tool.name === 'string' ? tool.name : '';
}

function toolDescription(tool: JsonRecord) {
  return typeof tool.description === 'string' ? tool.description : '';
}

function configuredAllowedTools(availableNames: Set<string>) {
  const configured = process.env.OPENART_MCP_ALLOWED_TOOLS?.split(',').map((name) => name.trim()).filter(Boolean) ?? [];
  if (!configured.length) return null;
  const allowed = configured.filter((name) => availableNames.has(name));
  if (!allowed.length) throw new Error(`OPENART_MCP_ALLOWED_TOOLS did not match the OpenArt MCP catalog. Available tools include: ${[...availableNames].slice(0, 20).join(', ')}`);
  return allowed.slice(0, 12);
}

function selectExecutionTools(listedTools: JsonRecord[]) {
  const names = new Set(listedTools.map(toolName).filter(Boolean));
  const configured = configuredAllowedTools(names);
  if (configured) return configured;

  const scored = listedTools
    .map((tool) => {
      const name = toolName(tool);
      const description = toolDescription(tool);
      const text = `${name} ${description}`;
      if (!name || /project|account|credit|billing|profile/i.test(name)) return { name, score: -1 };

      let score = 0;
      if (/(generate|generation|render)/i.test(text)) score += 120;
      if (/(video|animate)/i.test(text)) score += 80;
      if (/(submit|execute|run|start)/i.test(text)) score += 60;
      if (/(status|result|job|task|poll|wait)/i.test(text)) score += 45;
      if (name === 'openart_model_form_get') score += 35;
      if (name === 'openart_model_list') score += 20;
      if (/^openart_model_/i.test(name) && name !== 'openart_model_list' && name !== 'openart_model_form_get') score += 50;
      return { name, score };
    })
    .filter((entry) => entry.name && entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = [...new Set(scored.map((entry) => entry.name))].slice(0, 8);
  const hasExecutionCandidate = selected.some((name) => {
    if (name === 'openart_model_list' || name === 'openart_model_form_get') return false;
    return EXECUTION_TOOL_RE.test(name) || /^openart_model_/i.test(name);
  });

  if (!hasExecutionCandidate) {
    throw new Error(`OpenArt MCP catalog exposed no identifiable generation tool. Catalog: ${[...names].slice(0, 30).join(', ')}`);
  }

  return selected;
}

function groqMcpTool(token: string, url: string, allowedTools?: string[]) {
  return {
    type: 'mcp',
    server_label: 'openart',
    server_description: 'OpenArt image/video production tools. Use generation tools directly; project browsing is not needed for this job.',
    server_url: url,
    headers: { Authorization: `Bearer ${token}` },
    require_approval: 'never',
    ...(allowedTools?.length ? { allowed_tools: allowedTools } : {})
  };
}

async function discoverGroqExecutionTools(model: string, token: string, url: string) {
  const response = await createOpenAIResponse({
    model,
    max_output_tokens: 180,
    instructions: 'Inspect the connected OpenArt MCP catalog only. Do not call any OpenArt tool and do not generate media. Reply with one short sentence.',
    input: 'Catalog preflight only. Do not execute tools.',
    tools: [groqMcpTool(token, url)],
    tool_choice: 'none'
  });

  const listed = getMcpListedTools(response);
  if (!listed.length) {
    throw new Error('Groq connected to OpenArt MCP but did not return the MCP tool catalog during preflight. No OpenArt generation was started.');
  }

  const allowed = selectExecutionTools(listed);
  console.info(`OpenArt MCP narrowed ${listed.length} discovered tool(s) to ${allowed.length} render tool(s): ${allowed.join(', ')}`);
  return allowed;
}

async function generateViaOpenAICompatible(input: VideoGenerationRequest, token: string, url: string, modelHint: string) {
  const groq = selectedAiProvider() === 'groq';
  const model = groq
    ? process.env.GROQ_MCP_MODEL || DEFAULT_GROQ_MCP_MODEL
    : selectedOpenAIModel();

  if (!groq) {
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

  // Groq Free has an 8k TPM ceiling on the current MCP-capable models. Asking
  // the model to ingest every OpenArt schema and complete a multi-step render in
  // one shot exhausts that budget. First discover the catalog without executing
  // a tool, then expose only the small generation/status subset for the paid run.
  const allowedTools = await discoverGroqExecutionTools(model, token, url);
  const mcpTool = groqMcpTool(token, url, allowedTools);
  const attempts = 2;
  let lastResponse: Record<string, unknown> | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await createOpenAIResponse({
      model,
      max_output_tokens: groqOutputBudget(attempt),
      instructions: RENDER_SYSTEM,
      input: renderPrompt(input, modelHint, attempt > 1),
      tools: [mcpTool],
      max_tool_calls: 16,
      temperature: 0.1
    });
    lastResponse = response;

    const calls = getMcpCalls(response);
    const status = getResponseStatus(response);
    const urls = [...new Set([
      ...collectUrlsFromMcpCalls(calls),
      ...collectUrlsFromResponseMessages(response)
    ])];

    if (urls.length || (status === 'completed' && calls.length > 0)) {
      return { id: typeof response.id === 'string' ? response.id : `groq-${input.jobId}`, payload: response };
    }

    if (attempt < attempts && (calls.length === 0 || callsAreReadOnly(calls))) {
      const detail = getIncompleteDetail(response);
      const names = mcpCallNames(calls);
      console.warn(`Groq OpenArt MCP execution attempt ${attempt}/${attempts} stopped before a write action (${status}${detail ? `: ${detail}` : ''}; tools: ${names.join(', ') || 'none'}). Retrying safely.`);
      continue;
    }

    return { id: typeof response.id === 'string' ? response.id : `groq-${input.jobId}`, payload: response };
  }

  return {
    id: typeof lastResponse?.id === 'string' ? lastResponse.id : `groq-${input.jobId}`,
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
        throw new Error(`OpenArt MCP via ${aiProvider} returned no MCP tool execution. The render was not started and no OpenArt credits should have been spent.`);
      }

      urls = [...new Set([
        ...collectUrlsFromMcpCalls(mcpCalls),
        ...collectUrlsFromResponseMessages(result.payload)
      ])];

      if (!urls.length) {
        const names = mcpCallNames(mcpCalls);
        const status = getResponseStatus(result.payload);
        const detail = getIncompleteDetail(result.payload);
        const calls = names.length ? ` Tools: ${names.slice(0, 12).join(', ')}.` : '';
        const incomplete = detail ? ` Incomplete reason: ${detail}.` : '';
        const noWrite = callsAreReadOnly(mcpCalls)
          ? ' Only read-only OpenArt tools ran, so no OpenArt generation should have been charged.'
          : ' A write-capable tool may have run; check the OpenArt Media/Credits page before retrying to avoid a duplicate render.';
        throw new Error(`OpenArt MCP via ${aiProvider} executed ${mcpCalls.length} MCP call(s) but returned no media URL. Response status: ${status}.${incomplete}${calls}${noWrite} The render is not complete.`);
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
