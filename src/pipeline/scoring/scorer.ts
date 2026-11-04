import type { ActionType, ScoreRequest, SourceType } from '../../types/domain';

/**
 * Stage 2 significance scorer (standards §4/§7). PURE — no DB, no IO.
 * Six weighted factors, mirroring db/ase_schema.sql column comments exactly:
 *
 *   score_recency            +2 if signal <48h old, else 0
 *   score_source_authority   +2 primary / +1 secondary / 0 social
 *   score_action_type        +3 pricing / +2 product / +1 personnel / 0 other
 *   score_icp_relevance      +2 if matches tracked ICP
 *   score_deal_stage_context +2 if matches an active deal competitor
 *   score_novelty            +1 first detection / -1 repeated / 0 unknown
 */

export interface ScorerInput {
  /** When the source event/page was captured (raw_signals.collected_at). */
  collectedAt: Date;
  /** Reference "now" — injected so recency math is deterministic in tests. */
  now: Date;
  sourceType: SourceType;
  actionType: ActionType;
  icpMatch: boolean;
  activeDealCompetitor: boolean;
  isNovel: boolean;
  isRepeat: boolean;
}

export type SourceAuthorityTier = 'primary' | 'secondary' | 'social';

/** Authority tier per source type (schema comment: +2 primary / +1 secondary / 0 social). */
export const SOURCE_AUTHORITY: Record<SourceType, SourceAuthorityTier> = {
  competitor_website: 'primary',
  sec_edgar: 'primary',
  patents: 'primary',
  gong_chorus: 'primary',
  salesforce: 'primary',
  hubspot: 'primary',
  g2: 'secondary',
  capterra: 'secondary',
  trustradius: 'secondary',
  job_board: 'secondary',
  news_rss: 'secondary',
  slack: 'secondary',
  social_twitter: 'social',
  social_linkedin: 'social',
  social_reddit: 'social',
};

const SOURCE_AUTHORITY_POINTS: Record<SourceAuthorityTier, number> = {
  primary: 2,
  secondary: 1,
  social: 0,
};

const ACTION_TYPE_POINTS: Record<ActionType, number> = {
  pricing: 3,
  product: 2,
  personnel: 1,
  messaging: 0,
  partnership: 0,
  funding: 0,
  customer_win: 0,
  regulatory: 0,
  other: 0,
};

/** Recency window: 48 hours. */
export const RECENCY_WINDOW_MS = 48 * 60 * 60 * 1000;

export function computeRecencyScore(collectedAt: Date, now: Date): number {
  return now.getTime() - collectedAt.getTime() < RECENCY_WINDOW_MS ? 2 : 0;
}

/** +1 first detection, -1 repeated detection, 0 unknown (no history). */
function noveltyScore(isNovel: boolean, isRepeat: boolean): number {
  if (isNovel) return 1;
  if (isRepeat) return -1;
  return 0;
}

/** Compute all six factor scores from the (pure) scorer input. */
export function computeFactorScores(input: ScorerInput): ScoreRequest {
  return {
    scoreRecency: computeRecencyScore(input.collectedAt, input.now),
    scoreSourceAuthority: SOURCE_AUTHORITY_POINTS[SOURCE_AUTHORITY[input.sourceType]],
    scoreActionType: ACTION_TYPE_POINTS[input.actionType],
    scoreIcpRelevance: input.icpMatch ? 2 : 0,
    scoreDealStageContext: input.activeDealCompetitor ? 2 : 0,
    scoreNovelty: noveltyScore(input.isNovel, input.isRepeat),
  };
}

/**
 * Sum of the six factors, clamped 1..10 — mirrors the server-side clamp
 * (schema CHECK constraint chk_significance_range).
 */
export function computeSignificanceScore(req: ScoreRequest): number {
  const sum =
    req.scoreRecency +
    req.scoreSourceAuthority +
    req.scoreActionType +
    req.scoreIcpRelevance +
    req.scoreDealStageContext +
    req.scoreNovelty;
  return Math.min(10, Math.max(1, sum));
}
