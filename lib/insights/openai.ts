export type OpenAICallParams = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  timeoutMs: number;
};

export type OpenAIUsageSummary = {
  endpoint: 'responses';
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  finish_reason: string | null;
  attempts: number;
  max_output_tokens: number;
};

function extractTextFromResponsesApi(data: any): string | null {
  if (typeof data?.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text.trim();
  }

  const outputs = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];

  for (const o of outputs) {
    const content = Array.isArray(o?.content) ? o.content : [];
    for (const c of content) {
      const text = typeof c?.text === 'string' ? c.text : null;
      if (text && text.trim().length > 0) parts.push(text.trim());
    }
  }

  if (parts.length === 0) return null;
  return parts.join('\n').trim();
}

function normalizeUsageFromResponses(data: any, maxOutputTokens: number): OpenAIUsageSummary {
  const usage = data?.usage;
  const input = typeof usage?.input_tokens === 'number' ? usage.input_tokens : null;
  const output = typeof usage?.output_tokens === 'number' ? usage.output_tokens : null;
  const total = typeof usage?.total_tokens === 'number' ? usage.total_tokens : null;
  const model = typeof data?.model === 'string' ? data.model : 'unknown';

  return {
    endpoint: 'responses',
    model,
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    finish_reason: null,
    attempts: 1,
    max_output_tokens: maxOutputTokens,
  };
}

export async function callOpenAI(params: OpenAICallParams): Promise<{ text: string; usage: OpenAIUsageSummary | null }> {
  const { apiKey, model, systemPrompt, userPrompt, maxOutputTokens, timeoutMs } = params;

  const responsesUrl = 'https://api.openai.com/v1/responses';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const isGpt5 = model.startsWith('gpt-5');
    const verbosity: 'low' | 'medium' = isGpt5 ? 'low' : 'medium';

    const requestBody: any = {
      model,
      instructions: systemPrompt,
      input: userPrompt,
      max_output_tokens: maxOutputTokens,
      tool_choice: 'none',
      text: {
        verbosity,
        format: {
          type: 'json_schema',
          name: 'post_round_insights',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['messages'],
            properties: {
              messages: {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: { type: 'string' },
              },
            },
          },
        },
      },
    };

    // Responses API reasoning controls are not supported on all models (e.g., gpt-4o-mini).
    if (isGpt5) {
      requestBody.reasoning = { effort: 'minimal' };
    }

    const response = await fetch(responsesUrl, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI Responses API error (status ${response.status}): ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const text = extractTextFromResponsesApi(data);
    if (!text) {
      throw new Error('OpenAI returned no content');
    }

    return { text, usage: normalizeUsageFromResponses(data, maxOutputTokens) };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('OpenAI request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
