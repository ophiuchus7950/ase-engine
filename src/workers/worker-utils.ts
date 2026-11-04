/**
 * Shared poll-loop harness for the four ASE workers (standards §6).
 * Each worker file stays thin: build its runOnce() and call runWorkerLoop.
 *
 * Contract:
 *  - infinite poll loop at pollIntervalMs (interruptible sleep — SIGINT/SIGTERM
 *    wake it up immediately, so shutdown is prompt);
 *  - a thrown runOnce error is logged and the loop continues;
 *  - per-item errors are the worker's job (try/catch inside runOnce);
 *  - process exits 1 on a fatal loop error after the first signal.
 */

export interface WorkerLoopOptions {
  /** Worker name for log lines, e.g. 'collector'. */
  name: string;
  pollIntervalMs: number;
  /** One full queue pass. Errors are logged and the loop continues. */
  runOnce: () => Promise<void>;
}

export function runWorkerLoop(options: WorkerLoopOptions): void {
  const { name, pollIntervalMs, runOnce } = options;
  let shuttingDown = false;
  let wakeUp: (() => void) | null = null;
  const shutdownPromise = new Promise<void>((resolve) => {
    wakeUp = resolve;
  });

  const handleSignal = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${name}] received ${signal}; draining current batch and stopping`);
    wakeUp?.();
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  const sleep = (ms: number): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    });
    return Promise.race([timeout, shutdownPromise]).finally(() => {
      if (timer !== undefined) clearTimeout(timer);
    });
  };

  const loop = async (): Promise<void> => {
    console.log(`[${name}] worker started (poll every ${pollIntervalMs}ms)`);
    while (!shuttingDown) {
      try {
        await runOnce();
      } catch (err) {
        console.error(`[${name}] poll cycle failed:`, err);
      }
      if (!shuttingDown) await sleep(pollIntervalMs);
    }
    console.log(`[${name}] worker stopped`);
  };

  loop().catch((err: unknown) => {
    console.error(`[${name}] fatal error:`, err);
    process.exit(1);
  });
}
