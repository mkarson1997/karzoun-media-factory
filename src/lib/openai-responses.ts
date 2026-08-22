type OpenAIResponsePayload = Record<string, unknown>;

type ResponsesProvider = 'openai' | 'groq';

function extractErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  const message = record.message;
  return typeof message === 'string' && message.trim() ? message : null;
}

export function selectedResponsesProvider(env: NodeJS.ProcessEnv = process.env): ResponsesProvider {
  return env.AI_PROVIDER === 'groq' ? 'groq' : 'openai';
}

export function responsesProviderConfigured(env: NodeJS.ProcessEnv = process.env) {
  const provider = selectedResponsesProvider(env);
  return provider === 'groq' ? Boolean(env.GROQ_API_KEY?.trim()) : Boolean(env.OPENAI_API_KEY?.trim());
}

function providerConfig() {
  const provider = selectedResponsesProvider();
  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('Groq provider requires GROQ_API_KEY');
    return {
      provider,
      apiKey,
      endpoint: 'https://api.groq.com/openai/v1/responses'
    } as const;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI provider requires OPENAI_API_KEY');
  return {
    provider,
    apiKey,
    endpoint: 'https://api.openai.com/v1/responses'
  } as const;
}

function normalizePayload(payload: OpenAIResponsePayload, provider: ResponsesProvider) {
  if (provider !== 'groq') return payload;

  const normalized = { ...payload };

  // Groq's Responses-compatible endpoint is not feature-identical to OpenAI's.
  // In particular, models such as qwen/qwen3.6-27b reject reasoning.effort.
  // Strip OpenAI-only response controls before sending the request to Groq.
  delete normalized.reasoning;

  if (normalized.text && typeof normalized.text === 'object' && !Array.isArray(normalized.text)) {
    const text = { ...(normalized.text as Record<string, unknown>) };
    delete text.verbosity;
    normalized.text = text;
  }

  // Remote MCP injects the provider's discovered tool schemas into the model
  // context. On Groq's free/on-demand tier, qwen/qwen3.6-27b currently has an
  // 8k TPM ceiling, so a 3k completion budget can make an otherwise valid MCP
  // request exceed the limit before any OpenArt tool is executed. Keep MCP
  // completions below that ceiling while leaving ordinary creative-director
  // requests untouched. Advanced deployments can raise this after upgrading.
  const hasRemoteMcp = Array.isArray(normalized.tools) && normalized.tools.some((tool) => {
    return Boolean(tool && typeof tool === 'object' && (tool as Record<string, unknown>).type === 'mcp');
  });
  if (hasRemoteMcp && typeof normalized.max_output_tokens === 'number') {
    const configuredCap = Number(process.env.GROQ_MCP_REQUEST_OUTPUT_CAP);
    const safeCap = Number.isFinite(configuredCap) && configuredCap >= 800 && configuredCap <= 6000
      ? Math.floor(configuredCap)
      : 1750;
    normalized.max_output_tokens = Math.min(normalized.max_output_tokens, safeCap);
  }

  return normalized;
}

function groqRetryDelayMs(response: Response, body: unknown) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000) + 750;
  }

  const message = extractErrorMessage(body) || '';
  const match = message.match(/try again in\s+([\d.]+)s/i);
  if (match) return Math.ceil(Number(match[1]) * 1000) + 750;
  return 20_000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createOpenAIResponse(payload: OpenAIResponsePayload) {
  const config = providerConfig();
  const normalizedPayload = normalizePayload(payload, config.provider);
  const maxAttempts = config.provider === 'groq' ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(normalizedPayload),
      signal: AbortSignal.timeout(15 * 60 * 1000)
    });

    const body = await response.json().catch(() => null) as unknown;
    if (response.ok) {
      if (!body || typeof body !== 'object') throw new Error('Responses API returned an invalid response');
      return body as Record<string, unknown>;
    }

    if (config.provider === 'groq' && response.status === 429 && attempt < maxAttempts) {
      const delayMs = Math.min(65_000, Math.max(1_000, groqRetryDelayMs(response, body)));
      console.warn(`Groq rate limit reached. Retrying automatically in ${Math.ceil(delayMs / 1000)}s (${attempt}/${maxAttempts - 1}).`);
      await sleep(delayMs);
      continue;
    }

    const label = config.provider === 'groq' ? 'Groq' : 'OpenAI';
    const message = extractErrorMessage(body) || `${label} Responses API returned HTTP ${response.status}`;
    throw new Error(`${label} API: ${message}`);
  }

  throw new Error('Responses API retry loop exited unexpectedly');
}

export function getOpenAIOutputText(response: Record<string, unknown>) {
  const direct = response.output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const output = response.output;
  if (!Array.isArray(output)) return '';
  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const record = part as Record<string, unknown>;
      if ((record.type === 'output_text' || record.type === 'text') && typeof record.text === 'string') texts.push(record.text);
    }
  }
  return texts.join('\n').trim();
}

export function selectedOpenAIModel() {
  return selectedResponsesProvider() === 'groq'
    ? process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
    : process.env.OPENAI_MODEL || 'gpt-5.6-terra';
}
