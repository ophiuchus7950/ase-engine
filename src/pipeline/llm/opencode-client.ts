import { spawn } from 'node:child_process';

import { config } from '../../config';

/**
 * One-shot LLM client backed by the opencode CLI (OpenCode Zen).
 *
 * All Stage-1 LLM calls go through `opencode run` — never a direct provider API.
 * This module is deliberately narrow: spawn -> trimmed stdout, or a typed
 * LlmError. Prompt construction / response validation live in the classifier.
 */

/** Timeout for a single `opencode run` call (ms). */
export const OPENCODE_TIMEOUT_MS = 120_000;

/** Cap on captured stdout/stderr so a runaway LLM reply can't OOM the worker. */
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface OpenCodeClientOptions {
  /** Executable path/name. Defaults to config.OPENCODE_BIN. */
  bin?: string;
  /** Model id passed as `--model`. Defaults to config.LLM_MODEL. */
  model?: string;
  /** Per-call timeout in ms. Defaults to OPENCODE_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Run a one-shot prompt through `opencode run <prompt> --model <model>`.
 * Resolves with the trimmed stdout (the LLM reply). Rejects with LlmError on
 * non-zero exit, timeout, or spawn failure.
 *
 * Uses spawn (not execFile) so stdin can be forced to 'ignore': `opencode run`
 * blocks reading stdin when the parent's stdin pipe is open (e.g. launched
 * from a daemon/worker), which hangs the call until the timeout kill.
 */
export function runOpencode(prompt: string, options: OpenCodeClientOptions = {}): Promise<string> {
  const bin = options.bin ?? config.OPENCODE_BIN;
  const model = options.model ?? config.LLM_MODEL;
  const timeoutMs = options.timeoutMs ?? OPENCODE_TIMEOUT_MS;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, ['run', prompt, '--model', model], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const onStdout = (chunk: Buffer) => {
      stdout = Buffer.concat([Buffer.from(stdout), chunk]).toString('utf8');
      if (stdout.length > MAX_BUFFER_BYTES) {
        child.kill('SIGTERM');
        reject(new LlmError('opencode run stdout exceeded max buffer', null, stdout, stderr));
        settled = true;
      }
    };
    const onStderr = (chunk: Buffer) => {
      stderr = Buffer.concat([Buffer.from(stderr), chunk]).toString('utf8');
    };

    child.stdout?.on('data', onStdout);
    child.stderr?.on('data', onStderr);

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new LlmError(`opencode run failed to spawn: ${err.message}`, err, stdout, stderr));
      }
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const timedOut = signal === 'SIGTERM' || code === null;
      reject(
        new LlmError(
          timedOut
            ? `opencode run timed out after ${timeoutMs}ms`
            : `opencode run failed (exit ${code ?? 'unknown'})`,
          { code, signal },
          stdout,
          stderr,
        ),
      );
    });
  });
}
