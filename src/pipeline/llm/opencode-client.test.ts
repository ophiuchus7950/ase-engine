import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LlmError, runOpencode } from './opencode-client';

/**
 * Drives runOpencode against fake executable scripts so no real CLI or network
 * is involved. Also pins the exact argv contract: ['run', prompt, '--model', model].
 */

let dir: string;
let echoBin: string;
let failBin: string;
let slowBin: string;
let stdinSensitiveBin: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'opencode-client-test-'));
  echoBin = join(dir, 'echo.sh');
  writeFileSync(echoBin, '#!/bin/sh\necho "$@"\n');
  failBin = join(dir, 'fail.sh');
  writeFileSync(failBin, '#!/bin/sh\necho "boom" >&2\nexit 3\n');
  slowBin = join(dir, 'slow.sh');
  writeFileSync(slowBin, '#!/bin/sh\nsleep 5\n');
  // Regression: opencode run blocks reading stdin when the parent's stdin pipe
  // stays open (daemon/worker launch). This bin only emits its marker once
  // stdin hits EOF — with stdio 'ignore' (stdin=/dev/null) that is immediate.
  stdinSensitiveBin = join(dir, 'stdin-sensitive.sh');
  writeFileSync(stdinSensitiveBin, '#!/bin/sh\ncat >/dev/null\necho "STDIN_CLOSED_OK"\n');
  [echoBin, failBin, slowBin, stdinSensitiveBin].forEach((bin) => chmodSync(bin, 0o755));
});

afterAll(() => {
  // tmp dir is cleaned up by the OS; nothing to tear down.
});

describe('runOpencode', () => {
  it('resolves with trimmed stdout and passes the expected argv', async () => {
    await expect(runOpencode('hello', { bin: echoBin, model: 'test-model' })).resolves.toBe(
      'run hello --model test-model',
    );
  });

  it('rejects with LlmError on non-zero exit, carrying stderr', async () => {
    const promise = runOpencode('hello', { bin: failBin, model: 'test-model' });
    await expect(promise).rejects.toBeInstanceOf(LlmError);
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    if (err instanceof LlmError) {
      expect(err.message).toContain('exit 3');
      expect(err.stderr).toContain('boom');
    }
  });

  it('rejects with LlmError on timeout', async () => {
    const promise = runOpencode('hello', { bin: slowBin, model: 'test-model', timeoutMs: 300 });
    await expect(promise).rejects.toBeInstanceOf(LlmError);
    const err = await promise.catch((e: unknown) => e);
    if (err instanceof LlmError) {
      expect(err.message).toContain('timed out');
    }
  });

  it('rejects with LlmError when the binary cannot be spawned', async () => {
    await expect(
      runOpencode('hello', { bin: '/nonexistent/opencode', model: 'test-model' }),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it('does not block on an open parent stdin (regression: stdio ignore)', async () => {
    await expect(
      runOpencode('hello', { bin: stdinSensitiveBin, model: 'test-model', timeoutMs: 5000 }),
    ).resolves.toBe('STDIN_CLOSED_OK');
  });
});
