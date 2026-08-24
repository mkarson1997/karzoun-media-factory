import type { Tool } from '@modelcontextprotocol/client';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoGenerationResult } from './providers';
import { assertPaidGenerationAllowed } from './zero-cost';
import { DEFAULT_OPENART_MCP_URL, OpenArtMcpClient, type OpenArtToolResult } from './openart-mcp-client';
import { hasDurableOpenArtOAuthCredential } from './openart-oauth';
import { openSafeRemoteMedia } from './remote-media';

type JsonRecord = Record<string, unknown>;
type JsonSchema = JsonRecord & { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; default?: unknown; enum?: unknown[]; const?: unknown; $ref?: string; allOf?: JsonSchema[]; anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; $defs?: Record<string, JsonSchema>; minimum?: number; maximum?: number; maxLength?: number };
type OpenArtModel = { id: string; displayName: string; description: string; modes: { video?: Array<{ mode: string; description?: string }> } };
type ModelForm = { model: string; mode: string; media?: string; jsonSchema: JsonSchema; defaults?: JsonRecord };
type CostRow = { model: string; mode: string; totalCredits?: number; config?: JsonRecord };

export type OpenArtModelSelection = { model: OpenArtModel; mode: string; form: ModelForm; params: JsonRecord; actualDuration: number; estimatedCredits: number | null };
export type OpenArtResultFacts = { status: string; identifiers: Record<string, string>; urls: string[]; pollAfterSeconds: number | null; error: string | null; raw: unknown };

const CACHE_MS = 10 * 60_000;
const REQUIRED_TOOLS = ['openart_generate_video', 'openart_creation_get', 'openart_model_list', 'openart_model_form_get'] as const;
const IDENTIFIER_KEYS = /^(historyId|creationId|jobId|projectId|modelId|taskId|id)$/i;
const STATUS_KEYS = /^(status|state|providerStatus)$/i;
const URL_KEYS = /^(url|uri|download_?url|media_?url|file_?url|video_?url)$/i;
const CONTAINER_KEYS = /^(content|structuredContent|result|data|output|outputs|media|asset|assets|video|videos|resource|resources)$/i;
const MEDIA_URL_RE = /https:\/\/[^\s"'<>\\]+/g;
const REJECTED_URL_RE = /(?:docs?|documentation|dashboard|auth|oauth|login|model(?:s)?(?:\/|\?|$)|\/mcp(?:\/|\?|$))/i;

let sharedClient: OpenArtMcpClient | null = null;
let toolCache: { expiresAt: number; tools: Tool[] } | null = null;
let catalogCache: { expiresAt: number; models: OpenArtModel[]; costs: CostRow[] } | null = null;
const formCache = new Map<string, { expiresAt: number; form: ModelForm }>();

function client() { sharedClient ??= new OpenArtMcpClient(); return sharedClient; }
function isRecord(value: unknown): value is JsonRecord { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

function parseJsonText(value: string): unknown | null {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try { return JSON.parse(trimmed); } catch { return null; }
}

function payloadRoots(value: unknown) {
  const roots: unknown[] = [value];
  const seen = new Set<unknown>();
  for (let index = 0; index < roots.length; index++) {
    const current = roots[index];
    if (seen.has(current)) continue;
    seen.add(current);
    if (typeof current === 'string') {
      const parsed = parseJsonText(current);
      if (parsed !== null) roots.push(parsed);
    } else if (Array.isArray(current)) roots.push(...current);
    else if (isRecord(current)) {
      for (const [key, nested] of Object.entries(current)) if (CONTAINER_KEYS.test(key) || key === 'text') roots.push(nested);
    }
  }
  return roots;
}

function firstRecordWith(value: unknown, key: string) {
  return payloadRoots(value).find((item) => isRecord(item) && key in item) as JsonRecord | undefined;
}

function collectCostRows(value: unknown, rows: CostRow[] = [], seen = new Set<unknown>()): CostRow[] {
  if (seen.has(value)) return rows;
  if (value && typeof value === 'object') seen.add(value);
  if (typeof value === 'string') {
    const parsed = parseJsonText(value);
    if (parsed !== null) collectCostRows(parsed, rows, seen);
  } else if (Array.isArray(value)) {
    for (const item of value) collectCostRows(item, rows, seen);
  } else if (isRecord(value)) {
    if (typeof value.model === 'string' && typeof value.mode === 'string' && typeof value.totalCredits === 'number') rows.push(value as CostRow);
    for (const nested of Object.values(value)) collectCostRows(nested, rows, seen);
  }
  return rows;
}

function sanitizeProviderError(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/(?:sk-|gsk_|Bearer\s+)[A-Za-z0-9._-]+/gi, '[redacted]').replace(/https?:\/\/[^\s]+(?:token|oauth)[^\s]*/gi, '[redacted-url]').slice(0, 500);
}

export function extractOpenArtResultFacts(result: unknown): OpenArtResultFacts {
  const identifiers: Record<string, string> = {};
  const urls = new Set<string>();
  let status = 'UNKNOWN';
  let pollAfterSeconds: number | null = null;
  let error: string | null = null;
  const visited = new Set<unknown>();
  const visit = (value: unknown, parentKey = '') => {
    if (visited.has(value)) return;
    if (value && typeof value === 'object') visited.add(value);
    if (typeof value === 'string') {
      const parsed = parseJsonText(value);
      if (parsed !== null) visit(parsed, parentKey);
      for (const match of value.match(MEDIA_URL_RE) ?? []) {
        const candidate = match.replace(/[),.;\]}]+$/, '');
        if (isPlausibleMediaUrl(candidate, parentKey)) urls.add(candidate);
      }
      return;
    }
    if (Array.isArray(value)) { for (const item of value) visit(item, parentKey); return; }
    if (!isRecord(value)) return;
    for (const [key, nested] of Object.entries(value)) {
      if (IDENTIFIER_KEYS.test(key) && (typeof nested === 'string' || typeof nested === 'number')) identifiers[key] = String(nested);
      if (STATUS_KEYS.test(key) && typeof nested === 'string') status = nested.toUpperCase();
      if (/^pollAfterSeconds$/i.test(key) && typeof nested === 'number') pollAfterSeconds = nested;
      if (/^(error|errorMessage|failureReason|message)$/i.test(key) && typeof nested === 'string' && /fail|error|cancel|invalid/i.test(`${status} ${key} ${nested}`)) error = sanitizeProviderError(nested);
      if ((URL_KEYS.test(key) || CONTAINER_KEYS.test(key)) && typeof nested === 'string' && isPlausibleMediaUrl(nested, key)) urls.add(nested);
      visit(nested, key);
    }
  };
  visit(result);
  return { status, identifiers, urls: [...urls], pollAfterSeconds, error, raw: result };
}

export function extractCreationId(result: unknown) {
  const ids = extractOpenArtResultFacts(result).identifiers;
  return ids.historyId || ids.creationId || ids.jobId || ids.taskId || null;
}

export function isPlausibleMediaUrl(raw: string, key = '') {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (REJECTED_URL_RE.test(`${url.hostname}${url.pathname}`)) return false;
    if (/\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(raw)) return true;
    return URL_KEYS.test(key) || /(?:cdn|media|asset|output|download|storage|video)/i.test(`${url.hostname}${url.pathname}`);
  } catch { return false; }
}

export async function validateOpenArtMediaUrl(candidates: string[]) {
  let lastError = 'no candidate URL';
  for (const candidate of candidates) {
    try {
      const media = await openSafeRemoteMedia(candidate);
      if (media.contentLength !== null && media.contentLength < 1024) { media.stream.destroy(); throw new Error('asset is too small'); }
      media.stream.destroy();
      return media.finalUrl;
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
  }
  if (candidates.length) throw new Error(`OpenArt returned media candidates but none were accessible: ${lastError}`);
  return null;
}

function assertToolResult(result: OpenArtToolResult, tool: string) {
  if (result.isError) {
    const facts = extractOpenArtResultFacts(result);
    throw new Error(`${tool} failed: ${facts.error || sanitizeProviderError(result.content)}`);
  }
  return result;
}

function parseStructured<T>(result: OpenArtToolResult, expectedKey: string): T {
  const record = firstRecordWith(result, expectedKey);
  if (!record) throw new Error(`OpenArt response did not contain ${expectedKey}`);
  return record as T;
}

export async function discoverOpenArtTools(options?: { force?: boolean; mcpClient?: OpenArtMcpClient }) {
  if (!options?.force && toolCache && toolCache.expiresAt > Date.now()) return toolCache.tools;
  const tools = await (options?.mcpClient || client()).listTools();
  toolCache = { tools, expiresAt: Date.now() + CACHE_MS };
  return tools;
}

export function validateOpenArtToolDiscovery(tools: Array<{ name: string }>) {
  const names = new Set(tools.map((tool) => tool.name));
  const missing = REQUIRED_TOOLS.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`OpenArt MCP is missing required tools: ${missing.join(', ')}`);
  return { names: [...names], generationTool: 'openart_generate_video' };
}

async function loadCatalog(mcpClient = client(), force = false) {
  if (!force && catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache;
  validateOpenArtToolDiscovery(await discoverOpenArtTools({ force, mcpClient }));
  const [modelResult, costResult] = await Promise.all([mcpClient.callTool('openart_model_list', {}), mcpClient.callTool('openart_model_cost', {}).catch(() => null)]);
  const models = parseStructured<{ models: OpenArtModel[] }>(assertToolResult(modelResult, 'openart_model_list'), 'models').models;
  const costs = costResult && !costResult.isError ? collectCostRows(costResult) : [];
  catalogCache = { models, costs, expiresAt: Date.now() + CACHE_MS };
  return catalogCache;
}

async function loadForm(model: string, mode: string, mcpClient = client(), force = false) {
  const key = `${model}:${mode}`;
  const cached = formCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.form;
  const result = assertToolResult(await mcpClient.callTool('openart_model_form_get', { model, mode }), 'openart_model_form_get');
  const form = parseStructured<ModelForm>(result, 'jsonSchema');
  formCache.set(key, { form, expiresAt: Date.now() + CACHE_MS });
  return form;
}

function resolveSchema(schema: JsonSchema, root: JsonSchema): JsonSchema {
  if (!schema.$ref?.startsWith('#/$defs/')) return schema;
  return root.$defs?.[schema.$ref.slice('#/$defs/'.length)] || schema;
}
function objectBranches(schema: JsonSchema) { const outer = schema.allOf?.[0] || schema; return outer.anyOf || outer.oneOf || [outer]; }
function pickTextBranch(schema: JsonSchema) {
  const branches = objectBranches(schema);
  return branches.find((branch) => { const p = branch.properties || {}; return p.prompt && (!p.creationMode?.const || p.creationMode.const === 'text') && p.multiShot?.const !== true; }) || branches.find((branch) => branch.properties?.prompt) || branches[0];
}
function propertySchema(form: ModelForm, name: string) { const raw = pickTextBranch(form.jsonSchema).properties?.[name]; return raw ? resolveSchema(raw, form.jsonSchema) : undefined; }
function allowedNumber(schema: JsonSchema | undefined, requested: number, fallback: number) { return Math.max(typeof schema?.minimum === 'number' ? schema.minimum : 1, Math.min(typeof schema?.maximum === 'number' ? schema.maximum : requested, Math.floor(requested || fallback))); }
function defaultValue(schema: JsonSchema | undefined): unknown {
  if (!schema) return undefined;
  if (schema.const !== undefined) return schema.const;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 0;
  if (schema.type === 'string') return '';
  if (schema.type === 'array') return [];
  if (schema.type === 'object') return {};
  return undefined;
}

function compactRenderPrompt(raw: string, maxLength = 5000) {
  let value = raw;
  const parsed = parseJsonText(raw);
  if (isRecord(parsed)) {
    const shots = Array.isArray(parsed.shots) ? parsed.shots : [];
    value = [`Hook: ${String(parsed.hook || '')}`, `Story: ${String(parsed.script || '')}`, `Visual style: ${String(parsed.visualStyle || '')}`, `Audio: ${String(parsed.audioDirection || '')}`,
      ...shots.map((shot, index) => isRecord(shot) ? `Shot ${index + 1}: ${String(shot.visualPrompt || '')}; camera ${String(shot.camera || '')}; narration ${String(shot.narration || '')}` : ''),
      `Safety: ${Array.isArray(parsed.safetyNotes) ? parsed.safetyNotes.join('; ') : ''}`, 'Vertical 9:16. Original imagery only. No logos, celebrities, copyrighted characters, or copied creator footage.'].filter(Boolean).join('\n');
  }
  return value.length <= maxLength ? value : value.slice(0, Math.max(1, maxLength - 1)).trimEnd();
}

export function buildVideoParams(form: ModelForm, prompt: string, requestedDuration: number) {
  const branch = pickTextBranch(form.jsonSchema);
  const properties = branch.properties || {};
  const duration = allowedNumber(propertySchema(form, 'duration'), requestedDuration, 5);
  const params: JsonRecord = {};
  for (const name of branch.required || []) {
    const schema = propertySchema(form, name);
    if (name === 'prompt') params[name] = compactRenderPrompt(prompt, schema?.maxLength || 5000);
    else if (name === 'duration') params[name] = duration;
    else if (name === 'aspectRatio') params[name] = schema?.enum?.includes('9:16') ? '9:16' : defaultValue(schema);
    else if (name === 'videoCount') params[name] = 1;
    else if (name === 'generateAudio' || name === 'generateSound') params[name] = false;
    else if (name === 'seed') params[name] = -1;
    else params[name] = defaultValue(schema);
  }
  if ('autoEnhancePrompt' in properties) params.autoEnhancePrompt = false;
  return { params, actualDuration: duration };
}

function normalizeHint(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

export function rankOpenArtModelCandidates<T extends { model: { id: string }; hintMatch: boolean; vertical: number; durationFit: number; actualDuration: number; estimatedCredits: number | null }>(candidates: T[]) {
  return [...candidates].sort((a, b) => Number(b.hintMatch) - Number(a.hintMatch) || b.vertical - a.vertical || b.durationFit - a.durationFit || b.actualDuration - a.actualDuration || (a.estimatedCredits ?? Number.MAX_SAFE_INTEGER) - (b.estimatedCredits ?? Number.MAX_SAFE_INTEGER) || a.model.id.localeCompare(b.model.id));
}

export async function selectOpenArtVideoModel(input: { prompt: string; requestedDuration: number; hint?: string; mcpClient?: OpenArtMcpClient; force?: boolean }): Promise<OpenArtModelSelection> {
  const mcpClient = input.mcpClient || client();
  const catalog = await loadCatalog(mcpClient, input.force);
  const candidates = catalog.models.filter((model) => model.modes.video?.some((mode) => mode.mode === 'text2video'));
  if (!candidates.length) throw new Error('OpenArt currently exposes no text-to-video model');
  const hint = normalizeHint(input.hint || '');
  const evaluated = await Promise.all(candidates.map(async (model) => {
    const mode = 'text2video';
    const form = await loadForm(model.id, mode, mcpClient, input.force);
    const built = buildVideoParams(form, input.prompt, input.requestedDuration);
    const cost = catalog.costs.find((row) => row.model === model.id && row.mode === mode)?.totalCredits;
    const normalized = normalizeHint(`${model.id} ${model.displayName}`);
    return { model, mode, form, params: built.params, actualDuration: built.actualDuration, estimatedCredits: typeof cost === 'number' ? cost : null, hintMatch: Boolean(hint && (normalized.includes(hint) || hint.includes(normalizeHint(model.id)))), vertical: propertySchema(form, 'aspectRatio')?.enum?.includes('9:16') ? 1 : 0, durationFit: built.actualDuration >= input.requestedDuration ? 1 : 0 };
  }));
  return rankOpenArtModelCandidates(evaluated)[0];
}

function nextStatus(facts: OpenArtResultFacts) {
  if (/COMPLETED|SUCCEEDED|SUCCESS|DONE|READY/.test(facts.status)) return 'READY_FOR_REVIEW' as const;
  if (/FAILED|ERROR|CANCELLED|CANCELED/.test(facts.status)) return 'FAILED' as const;
  return 'GENERATING' as const;
}
function metadataFor(facts: OpenArtResultFacts, extra?: JsonRecord) { return { ...extra, identifiers: facts.identifiers, providerStatus: facts.status, urlsFound: facts.urls.length }; }
async function completedResult(providerJobId: string, facts: OpenArtResultFacts, metadata?: JsonRecord): Promise<VideoGenerationResult> {
  const videoUrl = await validateOpenArtMediaUrl(facts.urls);
  if (!videoUrl) throw new Error(`OpenArt creation ${providerJobId} completed without a usable media URL`);
  return { providerJobId, status: 'READY_FOR_REVIEW', videoUrl, providerStatus: facts.status, providerMetadata: metadataFor(facts, metadata) };
}

export class OpenArtMcpVideoProvider implements VideoGenerationProvider {
  async generateVideo(input: VideoGenerationRequest): Promise<VideoGenerationResult> {
    assertPaidGenerationAllowed('openart-mcp');
    const mcpClient = client();
    const selection = await selectOpenArtVideoModel({ prompt: input.prompt, requestedDuration: input.durationSeconds, hint: process.env.VIDEO_MODEL_HINT, mcpClient });
    console.info(`[JOB ${input.externalJobId || input.jobId}] OpenArt model selected: ${selection.model.id} (${selection.mode}, ${selection.actualDuration}s)`);
    const result = assertToolResult(await mcpClient.callTool('openart_generate_video', { model: selection.model.id, mode: selection.mode, params: selection.params }, 90_000), 'openart_generate_video');
    const facts = extractOpenArtResultFacts(result);
    const providerJobId = extractCreationId(result);
    if (!providerJobId) throw new Error('OpenArt accepted the generation call but returned no history/creation ID; automatic retry is disabled to prevent duplicate spending');
    const metadata = { model: selection.model.id, modelName: selection.model.displayName, mode: selection.mode, actualDuration: selection.actualDuration, requestedDuration: input.durationSeconds, estimatedCredits: selection.estimatedCredits };
    if (nextStatus(facts) === 'FAILED') throw new Error(facts.error || `OpenArt creation ${providerJobId} failed`);
    if (nextStatus(facts) === 'READY_FOR_REVIEW') return { ...(await completedResult(providerJobId, facts, metadata)), actualDuration: selection.actualDuration };
    return { providerJobId, status: 'GENERATING', providerStatus: facts.status, providerMetadata: metadataFor(facts, metadata), actualDuration: selection.actualDuration, nextPollSeconds: facts.pollAfterSeconds ?? 15 };
  }

  async getJobStatus(providerJobId: string): Promise<VideoGenerationResult> {
    const mcpClient = client();
    let result = assertToolResult(await mcpClient.callTool('openart_creation_get', { historyId: providerJobId }), 'openart_creation_get');
    let facts = extractOpenArtResultFacts(result);
    const state = nextStatus(facts);
    if (state === 'FAILED') return { providerJobId, status: 'FAILED', providerStatus: facts.status, providerMetadata: metadataFor(facts), failureReason: facts.error || `OpenArt creation ended with ${facts.status}` };
    if (state === 'READY_FOR_REVIEW' && !facts.urls.length) {
      result = assertToolResult(await mcpClient.callTool('openart_creation_show', { historyId: providerJobId }), 'openart_creation_show');
      facts = extractOpenArtResultFacts(result);
    }
    if (state === 'READY_FOR_REVIEW') return completedResult(providerJobId, facts);
    return { providerJobId, status: 'GENERATING', providerStatus: facts.status, providerMetadata: metadataFor(facts), nextPollSeconds: facts.pollAfterSeconds ?? 15 };
  }

  async cancelJob(): Promise<void> { throw new Error('OpenArt MCP does not expose a cancellation tool for this creation'); }
}

export async function preflightOpenArtMcp() {
  const mcpClient = new OpenArtMcpClient();
  try {
    const tools = await discoverOpenArtTools({ force: true, mcpClient });
    const discovery = validateOpenArtToolDiscovery(tools);
    const selection = await selectOpenArtVideoModel({ prompt: 'Preflight schema validation only. Do not generate media.', requestedDuration: 30, hint: process.env.VIDEO_MODEL_HINT, mcpClient, force: true });
    return { toolCount: tools.length, generationTool: discovery.generationTool, model: selection.model.id, actualDuration: selection.actualDuration, durableOAuth: await hasDurableOpenArtOAuthCredential() };
  } finally { await mcpClient.close(); }
}

export function openArtMcpStatus() {
  return { configured: Boolean(process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL), orchestration: 'direct-mcp' as const, paidGenerationUnlocked: process.env.ALLOW_PAID_GENERATION === 'true', serverUrl: process.env.OPENART_MCP_URL || DEFAULT_OPENART_MCP_URL, modelHint: process.env.VIDEO_MODEL_HINT || null };
}
