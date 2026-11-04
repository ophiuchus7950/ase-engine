import { config } from '../config';
import { ApiClient } from './api-client';
import { runWorkerLoop } from './worker-utils';

/**
 * Battlecard reconciliation worker (Workstream A, schema 003).
 *
 * Each tick asks the API to regenerate every "stale" competitor battlecard
 * (a signal_card signal routed after the current battlecard, or none built
 * yet) under trigger='worker'. The first runOnce call on startup performs the
 * "startup reconciliation" immediately.
 */
const api = new ApiClient(config.API_BASE_URL);

async function runOnce(): Promise<void> {
  const result = await api.reconcileBattlecards();
  console.log(
    `[battlecard] reconcile: regenerated ${result.regenerated} ` +
      `competitor${result.regenerated === 1 ? '' : 's'}`,
  );
}

runWorkerLoop({ name: 'battlecard', pollIntervalMs: config.WORKER_POLL_INTERVAL_MS, runOnce });
