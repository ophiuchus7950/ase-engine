/**
 * Rivela ASE — battlecard regeneration service (Workstream A).
 *
 * Pure "compute" lives in build.ts; this module is the thin "fetch + write"
 * glue shared by the routing-time trigger (trigger='routing'), the manual
 * update route (trigger='manual'), the reconciliation worker (trigger='worker')
 * and the startup reconciliation (trigger='startup').
 *
 * Every regeneration upserts the current battlecard document AND appends an
 * append-only battlecard_versions history entry (schema 003).
 */
import type { Repos } from '../db/repo-types';
import type {
  Battlecard,
  BattlecardTrigger,
  BattlecardVersion,
  SignalDetail,
} from '../types/domain';
import { buildBattlecardContent } from './build';

export interface RegenerateResult {
  battlecard: Battlecard;
  version: BattlecardVersion;
}

export interface ReconcileResult {
  regenerated: number;
  competitors: {
    competitorId: string;
    competitorName: string;
    versionId: string | null;
    error?: string;
  }[];
}

const SIGNAL_CARD_MIN_SIGNIFICANCE = 7;

/** Load a competitor's signal_card-routed signals (same query the route uses). */
async function loadRoutedSignals(
  repos: Repos,
  competitorId: string,
  organizationId: string,
): Promise<SignalDetail[]> {
  const page = await repos.signals.list(
    {
      organizationId,
      competitorId,
      routingDecision: 'signal_card',
      minSignificance: SIGNAL_CARD_MIN_SIGNIFICANCE,
    },
    { limit: 50, cursor: null },
  );
  return page.items;
}

/**
 * Regenerate a competitor's battlecard from their latest routed signals and
 * append a history version. Returns the new battlecard + version.
 */
export async function regenerateBattlecard(
  repos: Repos,
  competitorId: string,
  organizationId: string,
  trigger: BattlecardTrigger,
  triggeredBySignalId: string | null = null,
): Promise<RegenerateResult> {
  const competitor = await repos.competitors.getById(competitorId);
  const competitorName = competitor?.name ?? 'Unknown competitor';

  const signals = await loadRoutedSignals(repos, competitorId, organizationId);
  const content = buildBattlecardContent(competitorName, signals);

  const battlecard = await repos.battlecards.upsert(competitorId, content, new Date());
  const version = await repos.battlecards.appendVersion(
    competitorId,
    trigger,
    content,
    signals.length,
    triggeredBySignalId,
    new Date(),
  );

  return { battlecard, version };
}

/**
 * Reconcile: regenerate every stale competitor's battlecard (trigger='worker').
 * A single competitor's failure never aborts the sweep — it is logged and the
 * next competitor is attempted.
 */
export async function reconcileBattlecards(
  repos: Repos,
  organizationId: string,
): Promise<ReconcileResult> {
  const stale = await repos.battlecards.listStaleCompetitors(organizationId);
  const competitors: ReconcileResult['competitors'] = [];

  for (const { competitorId, competitorName } of stale) {
    try {
      const { version } = await regenerateBattlecard(
        repos,
        competitorId,
        organizationId,
        'worker',
        null,
      );
      competitors.push({ competitorId, competitorName, versionId: version.id });
    } catch (err) {
      console.error(`[battlecard] reconcile failed for competitor ${competitorId}:`, err);
      competitors.push({ competitorId, competitorName, versionId: null, error: String(err) });
    }
  }

  return { regenerated: competitors.filter((c) => c.versionId !== null).length, competitors };
}
