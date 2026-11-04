import { config } from '../../config';

/** Timeout for a single LLM API call (ms). */
export const LLM_TIMEOUT_MS = 120_000;

/** Cap on captured response so a runaway LLM reply can't OOM the worker. */
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly response: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmClientOptions {
  /** Model id passed to the provider. Defaults to config.LLM_MODEL. */
  model?: string;
  /** Per-call timeout in ms. Defaults to LLM_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Temperature for the model. */
  temperature?: number;
}

/**
 * Run a one-shot prompt through any OpenAI-compatible chat-completions API
 * (OpenRouter, OpenAI, Groq, local Ollama/LM Studio, ...).
 * Resolves with the trimmed response text. Rejects with LlmError on failure.
 */
export async function runLlm(prompt: string, options: LlmClientOptions = {}): Promise<string> {
  const model = options.model ?? config.LLM_MODEL;
  const timeoutMs = options.timeoutMs ?? LLM_TIMEOUT_MS;
  const temperature = options.temperature ?? 0.1;

  // Tolerate OpenRouter-style model ids ("openrouter/vendor/model").
  const cleanModel = model.replace(/^openrouter\//, '');

  const apiKey = config.LLM_API_KEY;
  if (!apiKey) {
    throw new LlmError('LLM_API_KEY not configured', null, '');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.LLM_BASE_URL.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Rivela ASE',
      },
      body: JSON.stringify({
        model: cleanModel,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new LlmError(
        `LLM API error (${response.status}): ${errorText}`,
        { status: response.status },
        errorText,
      );
    }

    const raw = (await response.text()).trim();
    if (raw.length > MAX_BUFFER_BYTES) {
      throw new LlmError('LLM response exceeded buffer cap', null, raw.slice(0, 1000));
    }

    const data = JSON.parse(raw) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new LlmError('Invalid LLM response format', null, JSON.stringify(data));
    }

    return data.choices[0].message.content?.trim() ?? '';
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof LlmError) throw err;

    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmError(`LLM request timed out after ${timeoutMs}ms`, err, '');
    }

    throw new LlmError(
      `LLM request failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
      '',
    );
  }
}
