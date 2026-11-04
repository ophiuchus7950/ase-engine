import type { ActionType, RouteRequest } from '../../types/domain';
import { ROUTING_DECISIONS } from '../../types/domain';

/**
 * Routing engine (spec §3). PURE — maps a significance score (+ optional
 * action type) to a routing outcome. Rule from ase_api_spec.md §3:
 *
 *   significance_score >= 7 -> signal_card
 *   4..6                     -> weekly_digest
 *   < 4                      -> archive
 *
 * MVP heuristic (documented, not from the spec): battlecard updates fire on
 * every signal_card; deal-alert checks additionally require a deal-relevant
 * action type (pricing / product / customer_win).
 */

export const SIGNAL_CARD_THRESHOLD = 7;
export const WEEKLY_DIGEST_THRESHOLD = 4;

/** Action types that warrant a deal-alert check on a signal_card (MVP heuristic). */
const DEAL_ALERT_ACTION_TYPES: readonly ActionType[] = ['pricing', 'product', 'customer_win'];

export function decideRouting(significanceScore: number, actionType?: ActionType): RouteRequest {
  const routingDecision = ROUTING_DECISIONS.find((decision) => {
    if (decision === 'signal_card') return significanceScore >= SIGNAL_CARD_THRESHOLD;
    if (decision === 'weekly_digest') return significanceScore >= WEEKLY_DIGEST_THRESHOLD;
    return true; // archive
  });

  // ROUTING_DECISIONS is non-empty and archive always matches, so this is exhaustive.
  const decision = routingDecision ?? 'archive';

  const battlecardUpdateTriggered = decision === 'signal_card';
  const dealAlertCheckTriggered =
    decision === 'signal_card' &&
    actionType !== undefined &&
    DEAL_ALERT_ACTION_TYPES.includes(actionType);

  return { routingDecision: decision, battlecardUpdateTriggered, dealAlertCheckTriggered };
}
