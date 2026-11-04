import { config } from '../config';
import { classifySignal } from '../pipeline/classification/classifier';
import { runOpencode } from '../pipeline/llm/opencode-client';
import { ApiClient } from './api-client';
import { runWorkerLoop } from './worker-utils';

/**
 * Classification worker (Stage 1): pulls unclassified raw signals, runs each
 * through the opencode-CLI LLM classifier, and submits the validated output
 * (ase_api_spec.md §3). One failed signal never blocks the queue.
 */

const api = new ApiClient(config.API_BASE_URL, config.ASE_API_KEY);

async function runOnce(): Promise<void> {
  const rawSignals = await api.listUnclassified(config.WORKER_BATCH_SIZE);
  for (const rawSignal of rawSignals) {
    try {
      const result = await classifySignal(rawSignal.rawText, {
        llm: (prompt) => runOpencode(prompt, { model: config.LLM_MODEL }),
        model: config.LLM_MODEL,
      });

      await api.submitClassification(rawSignal.id, {
        action_type: result.actionType,
        confidence_level: result.confidenceLevel,
        key_facts: result.keyFacts,
        llm_model_used: config.LLM_MODEL,
      });

      console.log(
        `[classifier] classified raw signal ${rawSignal.id} as ${result.actionType} ` +
          `(${result.confidenceLevel})`,
      );
    } catch (err) {
      console.error(`[classifier] failed for raw signal ${rawSignal.id}:`, err);
    }
  }
}

runWorkerLoop({ name: 'classifier', pollIntervalMs: config.WORKER_POLL_INTERVAL_MS, runOnce });
