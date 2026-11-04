import { config } from '../config';
import { decideRouting } from '../pipeline/routing/router';
import { ApiClient } from './api-client';
import { runWorkerLoop } from './worker-utils';

/**
 * Routing worker (Stage 3): pulls scored-but-unrouted signals, computes the
 * routing outcome from the significance score (+ action type), and submits it
 * (ase_api_spec.md §3).
 */

const api = new ApiClient(config.API_BASE_URL);

async function runOnce(): Promise<void> {
  const signals = await api.listPendingRouting(config.WORKER_BATCH_SIZE);
  for (const signal of signals) {
    try {
      const detail = await api.getSignal(signal.id);
      const route = decideRouting(detail.significanceScore, detail.actionType);

      await api.submitRoute(signal.id, {
        routing_decision: route.routingDecision,
        battlecard_update_triggered: route.battlecardUpdateTriggered,
        deal_alert_check_triggered: route.dealAlertCheckTriggered,
      });

      console.log(`[router] routed signal ${signal.id} -> ${route.routingDecision}`);
    } catch (err) {
      console.error(`[router] failed for signal ${signal.id}:`, err);
    }
  }
}

runWorkerLoop({ name: 'router', pollIntervalMs: config.WORKER_POLL_INTERVAL_MS, runOnce });
