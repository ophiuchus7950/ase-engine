import { z } from 'zod';

import type { ClassificationResult } from '../../types/domain';

/**
 * Stage 1 classifier (standards §4/§5): LLM output is validated with zod at
 * the boundary, never cast. The LLM call itself is injected so this module is
 * pure and unit-testable with a fake `llm`.
 *
 * Enum tuples mirror src/types/domain.ts; drift is caught at compile time by
 * the ClassificationResult return-type check in parseClassificationReply.
 */

const ACTION_TYPE_TUPLE = [
  'pricing',
  'product',
  'personnel',
  'messaging',
  'partnership',
  'funding',
  'customer_win',
  'regulatory',
  'other',
] as const;

const CONFIDENCE_LEVEL_TUPLE = ['high', 'medium', 'low'] as const;

/** Runtime schema for the classifier's JSON reply — exported for tests. */
export const ClassificationResultSchema = z.object({
  actionType: z.enum(ACTION_TYPE_TUPLE),
  confidenceLevel: z.enum(CONFIDENCE_LEVEL_TUPLE),
  keyFacts: z.array(z.string()).min(1).max(3),
});

/** Typed error for any failure while producing a valid ClassificationResult. */
export class ClassificationError extends Error {
  constructor(
    message: string,
    /** The raw LLM output that failed to parse/validate ('' when the LLM call itself failed). */
    public readonly rawLlmOutput: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ClassificationError';
  }
}

export interface ClassifierDeps {
  llm: (prompt: string) => Promise<string>;
  /** Model identifier used for this classification. Reserved for prompt
   *  customization / observability — not currently interpolated into the prompt. */
  model: string;
}

export function buildClassificationPrompt(rawText: string): string {
  return [
    'You are a competitive intelligence analyst for a B2B SaaS company.',
    'Classify the following competitor signal. Respond with ONLY a JSON object, no markdown fences, no commentary:',
    '{"actionType": "pricing|product|personnel|messaging|partnership|funding|customer_win|regulatory|other", "confidenceLevel": "high|medium|low", "keyFacts": [2-3 short strings]}',
    `Signal: ${rawText}`,
  ].join('\n');
}

/**
 * Classify a raw signal text into {actionType, confidenceLevel, keyFacts}.
 * Throws ClassificationError if the LLM call fails or the reply is not a
 * valid ClassificationResult (standards §5 — validate, never trust).
 */
export async function classifySignal(
  rawText: string,
  deps: ClassifierDeps,
): Promise<ClassificationResult> {
  const prompt = buildClassificationPrompt(rawText);

  let reply: string;
  try {
    reply = await deps.llm(prompt);
  } catch (err) {
    throw new ClassificationError('LLM call failed during classification', '', err);
  }

  return parseClassificationReply(reply);
}

/** Parse + zod-validate a raw LLM reply into a ClassificationResult. Exported for tests. */
export function parseClassificationReply(reply: string): ClassificationResult {
  const cleaned = stripMarkdownFences(reply);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new ClassificationError('LLM reply is not valid JSON', reply, err);
  }

  const result = ClassificationResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ClassificationError(
      `LLM reply failed schema validation: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
      reply,
      result.error,
    );
  }

  return result.data;
}

/** Extract a fenced ```json / ``` block if present anywhere in the reply; otherwise return as-is. */
function stripMarkdownFences(reply: string): string {
  const trimmed = reply.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
