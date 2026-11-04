import { describe, expect, it } from 'vitest';

import {
  ClassificationError,
  ClassificationResultSchema,
  buildClassificationPrompt,
  classifySignal,
  parseClassificationReply,
} from './classifier';
import type { ClassifierDeps } from './classifier';

const VALID_JSON = JSON.stringify({
  actionType: 'pricing',
  confidenceLevel: 'high',
  keyFacts: ['Raised Series B', 'New CEO hired', 'Expanded to EU'],
});

/** Build deps whose fake LLM returns a canned reply. */
function depsReturning(reply: string): ClassifierDeps {
  return { llm: async () => reply, model: 'test-model' };
}

function depsThrowing(error: Error): ClassifierDeps {
  return { llm: async () => Promise.reject(error), model: 'test-model' };
}

describe('classifySignal', () => {
  it('returns a validated ClassificationResult for a plain JSON reply', async () => {
    const result = await classifySignal('Acme raised $50M', depsReturning(VALID_JSON));
    expect(result).toEqual({
      actionType: 'pricing',
      confidenceLevel: 'high',
      keyFacts: ['Raised Series B', 'New CEO hired', 'Expanded to EU'],
    });
  });

  it('parses a ```json-fenced reply', async () => {
    const fenced = `Here is the analysis:\n\`\`\`json\n${VALID_JSON}\n\`\`\``;
    const result = await classifySignal('Acme raised $50M', depsReturning(fenced));
    expect(result.actionType).toBe('pricing');
  });

  it('parses a fence without a language tag', async () => {
    const fenced = `\`\`\`\n${VALID_JSON}\n\`\`\``;
    await expect(classifySignal('x', depsReturning(fenced))).resolves.toMatchObject({
      actionType: 'pricing',
    });
  });

  it('tolerates surrounding whitespace', async () => {
    const padded = `  \n${VALID_JSON}\n  `;
    await expect(classifySignal('x', depsReturning(padded))).resolves.toMatchObject({
      actionType: 'pricing',
    });
  });

  it('throws ClassificationError when the reply is not valid JSON', async () => {
    await expect(classifySignal('x', depsReturning('definitely not json'))).rejects.toBeInstanceOf(
      ClassificationError,
    );
  });

  it('throws ClassificationError when JSON fails zod validation (bad enum value)', async () => {
    const bad = JSON.stringify({ actionType: 'banana', confidenceLevel: 'high', keyFacts: ['a'] });
    await expect(classifySignal('x', depsReturning(bad))).rejects.toBeInstanceOf(
      ClassificationError,
    );
  });

  it('throws ClassificationError when keyFacts is empty', async () => {
    const bad = JSON.stringify({ actionType: 'pricing', confidenceLevel: 'high', keyFacts: [] });
    await expect(classifySignal('x', depsReturning(bad))).rejects.toBeInstanceOf(
      ClassificationError,
    );
  });

  it('throws ClassificationError when keyFacts exceeds 3 entries', async () => {
    const bad = JSON.stringify({
      actionType: 'pricing',
      confidenceLevel: 'high',
      keyFacts: ['a', 'b', 'c', 'd'],
    });
    await expect(classifySignal('x', depsReturning(bad))).rejects.toBeInstanceOf(
      ClassificationError,
    );
  });

  it('throws ClassificationError when a required field is missing', async () => {
    const bad = JSON.stringify({ actionType: 'pricing', keyFacts: ['a'] });
    await expect(classifySignal('x', depsReturning(bad))).rejects.toBeInstanceOf(
      ClassificationError,
    );
  });

  it('wraps LLM call failures in ClassificationError', async () => {
    await expect(classifySignal('x', depsThrowing(new Error('boom')))).rejects.toBeInstanceOf(
      ClassificationError,
    );
  });
});

describe('parseClassificationReply', () => {
  it('exposes the raw offending output on failure', async () => {
    try {
      parseClassificationReply('not json');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ClassificationError);
      if (err instanceof ClassificationError) {
        expect(err.rawLlmOutput).toBe('not json');
      }
    }
  });
});

describe('ClassificationResultSchema', () => {
  it('parses a valid object', () => {
    const parsed = ClassificationResultSchema.parse(JSON.parse(VALID_JSON));
    expect(parsed).toEqual({
      actionType: 'pricing',
      confidenceLevel: 'high',
      keyFacts: ['Raised Series B', 'New CEO hired', 'Expanded to EU'],
    });
  });

  it('rejects an invalid object', () => {
    const parsed = ClassificationResultSchema.safeParse({ actionType: 'nope' });
    expect(parsed.success).toBe(false);
  });
});

describe('buildClassificationPrompt', () => {
  it('embeds the raw signal text and demands JSON-only output', () => {
    const prompt = buildClassificationPrompt('Acme changed pricing');
    expect(prompt).toContain('Acme changed pricing');
    expect(prompt).toContain('Respond with ONLY a JSON object, no markdown fences, no commentary');
    expect(prompt).toContain('"actionType"');
  });
});
