import { config } from '../config';
import { computeFactorScores } from '../pipeline/scoring/scorer';
import { ApiClient } from './api-client';
import { runWorkerLoop } from './worker-utils';

/**
 * Scoring worker (Stage 2): pulls classified-but-unscored signals, computes
 * the six factor scores, and submits them (the server sums + clamps to 1-10).
 *
 * MVP context defaults (documented): no ICP tracking or deal pipeline exists
 * yet, and dedup history is not exposed, so icpMatch=false,
 * activeDealCompetitor=false, isNovel=true, isRepeat=false. Recency is the
 * only context-aware factor today (collected_at vs now).
 */

const api = new ApiClient(config.API_BASE_URL, config.ASE_API_KEY);

const MVP_CONTEXT = {
  icpMatch: false,
  activeDealCompetitor: false,
  isNovel: true,
  isRepeat: false,
} as const;

async function runOnce(): Promise<void> {
  const signals = await api.listPendingScoring(config.WORKER_BATCH_SIZE);
  for (const signal of signals) {
    try {
      // GET the joined detail for collected_at + source_type + action_type.
      const detail = await api.getSignal(signal.id);

      const scores = computeFactorScores({
        collectedAt: new Date(detail.collectedAt),
        now: new Date(),
        sourceType: detail.sourceType,
        actionType: detail.actionType,
        ...MVP_CONTEXT,
      });

      await api.submitScore(signal.id, {
        score_recency: scores.scoreRecency,
        score_source_authority: scores.scoreSourceAuthority,
        score_action_type: scores.scoreActionType,
        score_icp_relevance: scores.scoreIcpRelevance,
        score_deal_stage_context: scores.scoreDealStageContext,
        score_novelty: scores.scoreNovelty,
      });

      console.log(`[scorer] scored signal ${signal.id}`);
    } catch (err) {
      console.error(`[scorer] failed for signal ${signal.id}:`, err);
    }
  }
}

runWorkerLoop({ name: 'scorer', pollIntervalMs: config.WORKER_POLL_INTERVAL_MS, runOnce });
