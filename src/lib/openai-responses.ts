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
  if (normalized.text && typeof normalized.text === 'object' && !Array.isArray(normalized.text)) {
    const text = { ...(normalized.text as Record<string, unknown>) };
    delete text.verbosity;
    normalized.text = text;
  }
  return normalized;
}

export async function createOpenAIResponse(payload: OpenAIResponsePayload) {
  const config = providerConfig();
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(normalizePayload(payload, config.provider)),
    signal: AbortSignal.timeout(15 * 60 * 1000)
  });

  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const label = config.provider === 'groq' ? 'Groq' : 'OpenAI';
    const message = extractErrorMessage(body) || `${label} Responses API returned HTTP ${response.status}`;
    throw new Error(`${label} API: ${message}`);
  }
  if (!body || typeof body !== 'object') throw new Error('Responses API returned an invalid response');
  return body as Record<string, unknown>;
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
