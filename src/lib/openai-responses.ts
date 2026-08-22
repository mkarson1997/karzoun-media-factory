type OpenAIResponsePayload = Record<string, unknown>;

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

export async function createOpenAIResponse(payload: OpenAIResponsePayload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI provider requires OPENAI_API_KEY');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15 * 60 * 1000)
  });

  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = extractErrorMessage(body) || `OpenAI Responses API returned HTTP ${response.status}`;
    throw new Error(`OpenAI API: ${message}`);
  }
  if (!body || typeof body !== 'object') throw new Error('OpenAI Responses API returned an invalid response');
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
  return process.env.OPENAI_MODEL || 'gpt-5.6-terra';
}
