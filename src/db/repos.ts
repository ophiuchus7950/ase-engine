import type { Pool } from 'pg';

import type {
  ActionType,
  AlertRule,
  AlertRuleChannel,
  AlertRuleTriggers,
  Battlecard,
  BattlecardContent,
  BattlecardTrigger,
  BattlecardVersion,
  ConfidenceLevel,
  DataSource,
  Paginated,
  RawSignal,
  RoutingDecision,
  Signal,
  SignalDetail,
  SourceType,
} from '../types/domain';
import type {
  AlertRuleRepo,
  BattlecardRepo,
  CompetitorProfileRepo,
  CompetitorRepo,
  DataSourceRepo,
  NotificationRepo,
  PageParams,
  RawSignalRepo,
  Repos,
  SignalRepo,
  UserRepo,
} from './repo-types';

/**
 * Postgres implementation of the repo interface contract (src/db/repo-types.ts).
 *
 * - snake_case DB rows are mapped to camelCase domain types at the boundary
 *   (ase_coding_standards.md §2) via the to* mappers below — one mapper per
 *   entity, no ad-hoc renaming in business logic.
 * - Pool-injectable: createRepos(pool) — tests pass a pool pointed at a
 *   dedicated test database (ase_test).
 */

// ---------------------------------------------------------------------------
// Typed errors (standards §6)
// ---------------------------------------------------------------------------

/** Wraps any database failure with the repo operation that triggered it. */
export class RepoError extends Error {
  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RepoError';
  }
}

/** Runs fn, rethrowing non-RepoError failures as RepoError(operation, ...). */
async function guard<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RepoError) throw err;
    throw new RepoError(operation, `Database operation '${operation}' failed`, err);
  }
}

/** Returns the single row a RETURNING/DML query must have produced, or throws. */
function requireRow<T>(rows: T[], operation: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new RepoError(operation, `Database operation '${operation}' returned no row`);
  }
  return row;
}

// ---------------------------------------------------------------------------
// DB row shapes (snake_case, straight from Postgres) + boundary mappers (§2)
// ---------------------------------------------------------------------------

interface DataSourceRow {
  id: string;
  organization_id: string;
  competitor_id: string | null;
  source_type: SourceType;
  target_url: string | null;
  collection_method: string;
  refresh_interval_minutes: number;
  is_active: boolean;
  last_collected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RawSignalRow {
  id: string;
  organization_id: string;
  competitor_id: string;
  data_source_id: string | null;
  source_type: SourceType;
  raw_text: string;
  source_url: string | null;
  collection_method: string;
  collected_at: Date;
  content_hash: string;
  ingested_at: Date;
}

interface SignalRow {
  id: string;
  raw_signal_id: string;
  organization_id: string;
  competitor_id: string;
  action_type: ActionType;
  confidence_level: ConfidenceLevel;
  key_facts: unknown; // JSONB — parsed to string[] by toSignal()
  llm_model_used: string | null;
  classified_at: Date | null;
  score_recency: number;
  score_source_authority: number;
  score_action_type: number;
  score_icp_relevance: number;
  score_deal_stage_context: number;
  score_novelty: number;
  significance_score: number;
  scored_at: Date | null;
  routing_decision: RoutingDecision;
  battlecard_update_triggered: boolean;
  deal_alert_check_triggered: boolean;
  routed_at: Date | null;
  bookmarked: boolean;
  created_at: Date;
}

/** signals JOINed with raw_signals + competitors (raw_* aliases avoid collisions). */
interface SignalDetailRow extends SignalRow {
  raw_text: string;
  raw_source_type: SourceType;
  raw_source_url: string | null;
  raw_collected_at: Date;
  competitor_name: string;
}

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/** Non-null variant for NOT NULL timestamp columns (domain types say `string`). */
function toIsoRequired(value: Date): string {
  return value.toISOString();
}

/** JSONB key_facts → string[] (defensive: DB may contain null/malformed JSON). */
function parseKeyFacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toDataSource(row: DataSourceRow): DataSource {
  return {
    id: row.id,
    organizationId: row.organization_id,
    competitorId: row.competitor_id,
    sourceType: row.source_type,
    targetUrl: row.target_url,
    collectionMethod: row.collection_method,
    refreshIntervalMinutes: row.refresh_interval_minutes,
    isActive: row.is_active,
    lastCollectedAt: toIso(row.last_collected_at),
    createdAt: toIsoRequired(row.created_at),
    updatedAt: toIsoRequired(row.updated_at),
  };
}

function toRawSignal(row: RawSignalRow): RawSignal {
  return {
    id: row.id,
    organizationId: row.organization_id,
    competitorId: row.competitor_id,
    dataSourceId: row.data_source_id,
    sourceType: row.source_type,
    rawText: row.raw_text,
    sourceUrl: row.source_url,
    collectionMethod: row.collection_method,
    collectedAt: toIsoRequired(row.collected_at),
    contentHash: row.content_hash,
    ingestedAt: toIsoRequired(row.ingested_at),
  };
}

function toSignal(row: SignalRow): Signal {
  return {
    id: row.id,
    rawSignalId: row.raw_signal_id,
    organizationId: row.organization_id,
    competitorId: row.competitor_id,
    actionType: row.action_type,
    confidenceLevel: row.confidence_level,
    keyFacts: parseKeyFacts(row.key_facts),
    llmModelUsed: row.llm_model_used,
    classifiedAt: toIso(row.classified_at),
    scoreRecency: row.score_recency,
    scoreSourceAuthority: row.score_source_authority,
    scoreActionType: row.score_action_type,
    scoreIcpRelevance: row.score_icp_relevance,
    scoreDealStageContext: row.score_deal_stage_context,
    scoreNovelty: row.score_novelty,
    significanceScore: row.significance_score,
    scoredAt: toIso(row.scored_at),
    routingDecision: row.routing_decision,
    battlecardUpdateTriggered: row.battlecard_update_triggered,
    dealAlertCheckTriggered: row.deal_alert_check_triggered,
    routedAt: toIso(row.routed_at),
    bookmarked: row.bookmarked,
    createdAt: toIsoRequired(row.created_at),
  };
}

function toSignalDetail(row: SignalDetailRow): SignalDetail {
  return {
    ...toSignal(row),
    rawText: row.raw_text,
    sourceType: row.raw_source_type,
    sourceUrl: row.raw_source_url,
    collectedAt: toIsoRequired(row.raw_collected_at),
    competitorName: row.competitor_name,
  };
}

// ---------------------------------------------------------------------------
// Schema 002 rows + mappers (users, alert rules, notifications, battlecards)
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  organization_id: string;
  name: string;
  password_hash: string;
  created_at: Date;
}

interface AlertRuleRow {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggers: unknown; // JSONB
  channels: unknown; // JSONB
  routing_override: RoutingDecision | null;
  fired_count: number;
  created_at: Date;
  updated_at: Date;
}

interface NotificationRow {
  id: string;
  organization_id: string;
  signal_id: string | null;
  rule_id: string | null;
  title: string;
  body: string;
  channel: string;
  status: 'delivered' | 'failed' | 'pending';
  read_at: Date | null;
  created_at: Date;
}

interface BattlecardRow {
  competitor_id: string;
  content: unknown; // JSONB
  generated_at: Date;
  updated_at: Date;
}

interface BattlecardVersionRow {
  id: string;
  competitor_id: string;
  trigger: string; // BattlecardTrigger
  content: unknown; // JSONB
  source_signal_count: number;
  triggered_by_signal_id: string | null;
  generated_at: Date;
}

interface CompetitorProfileRow {
  id: string;
  organization_id: string;
  name: string;
  created_at: Date;
  signal_count: number;
  monitoring_active: boolean | null;
  sources: unknown; // jsonb array
}

interface CompetitorRow {
  id: string;
  organization_id: string;
  name: string;
  created_at: Date;
}

function toCompetitor(row: CompetitorRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    createdAt: toIsoRequired(row.created_at),
  };
}

function toUser(row: UserRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: toIsoRequired(row.created_at),
  };
}

function toPublicUser(row: UserRow) {
  return { id: row.id, organizationId: row.organization_id, name: row.name };
}

function toAlertRule(row: AlertRuleRow): AlertRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    triggers: (row.triggers as AlertRuleTriggers) ?? {},
    channels: Array.isArray(row.channels) ? (row.channels as AlertRuleChannel[]) : [],
    routingOverride: row.routing_override ?? null,
    firedCount: row.fired_count,
    createdAt: toIsoRequired(row.created_at),
    updatedAt: toIsoRequired(row.updated_at),
  };
}

function toNotification(row: NotificationRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    signalId: row.signal_id,
    ruleId: row.rule_id,
    title: row.title,
    body: row.body,
    channel: row.channel,
    status: row.status,
    readAt: toIso(row.read_at),
    createdAt: toIsoRequired(row.created_at),
  };
}

function toBattlecard(row: BattlecardRow): Battlecard {
  const content = row.content as BattlecardContent | null;
  return {
    competitorId: row.competitor_id,
    content: content ?? { competitorName: '', summary: '', sections: [], sourceSignals: [] },
    generatedAt: toIsoRequired(row.generated_at),
    updatedAt: toIsoRequired(row.updated_at),
  };
}

function toBattlecardVersion(row: BattlecardVersionRow): BattlecardVersion {
  const content = row.content as BattlecardContent | null;
  return {
    id: row.id,
    competitorId: row.competitor_id,
    trigger: row.trigger as BattlecardTrigger,
    content: content ?? { competitorName: '', summary: '', sections: [], sourceSignals: [] },
    sourceSignalCount: row.source_signal_count,
    triggeredBySignalId: row.triggered_by_signal_id,
    generatedAt: toIsoRequired(row.generated_at),
  };
}

// ---------------------------------------------------------------------------
// Shared keyset pagination: id > cursor, LIMIT limit+1 to detect the next page
// ---------------------------------------------------------------------------

/**
 * Runs `baseSql <whereSql> [AND <orderColumn> > cursor] ORDER BY <orderColumn> LIMIT limit+1`.
 * `whereSql` is '' or a 'WHERE ...' fragment with positional $n placeholders
 * (no cursor clause — it is appended here). `orderColumn` defaults to 'id';
 * pass a qualified name (e.g. 's.id') when the query joins tables that both have id.
 */
async function queryPage<T extends { id: string }>(
  pool: Pool,
  baseSql: string,
  whereSql: string,
  whereParams: unknown[],
  page: PageParams,
  orderColumn = 'id',
): Promise<Paginated<T>> {
  const params = [...whereParams];
  const hasWhere = whereSql.trim().length > 0;
  let clause = hasWhere ? whereSql : '';
  if (page.cursor !== null) {
    params.push(page.cursor);
    clause += hasWhere
      ? ` AND ${orderColumn} > $${params.length}`
      : ` WHERE ${orderColumn} > $${params.length}`;
  }
  params.push(page.limit + 1);
  const { rows } = await pool.query<T>(
    `${baseSql} ${clause} ORDER BY ${orderColumn} LIMIT $${params.length}`,
    params,
  );
  const hasMore = rows.length > page.limit;
  const items = hasMore ? rows.slice(0, page.limit) : rows;
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    limit: page.limit,
  };
}

// ---------------------------------------------------------------------------
// signals + raw_signals + competitors joined view (getById / list / listRouted)
// ---------------------------------------------------------------------------

const SIGNAL_DETAIL_SELECT = `SELECT s.*,
    r.raw_text,
    r.source_type AS raw_source_type,
    r.source_url AS raw_source_url,
    r.collected_at AS raw_collected_at,
    c.name AS competitor_name
  FROM signals s
  JOIN raw_signals r ON r.id = s.raw_signal_id
  JOIN competitors c ON c.id = s.competitor_id`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRepos(pool: Pool): Repos {
  const dataSources: DataSourceRepo = {
    create: (organizationId, req) =>
      guard('dataSources.create', async () => {
        const { rows } = await pool.query<DataSourceRow>(
          `INSERT INTO data_sources (
             organization_id, competitor_id, source_type, target_url,
             collection_method, refresh_interval_minutes
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            organizationId,
            req.competitorId,
            req.sourceType,
            req.targetUrl,
            req.collectionMethod,
            req.refreshIntervalMinutes,
          ],
        );
        return toDataSource(requireRow(rows, 'dataSources.create'));
      }),

    list: (organizationId, filters, page) =>
      guard('dataSources.list', async () => {
        const clauses: string[] = ['organization_id = $1'];
        const params: unknown[] = [organizationId];
        if (filters.competitorId !== undefined) {
          params.push(filters.competitorId);
          clauses.push(`competitor_id = $${params.length}`);
        }
        if (filters.sourceType !== undefined) {
          params.push(filters.sourceType);
          clauses.push(`source_type = $${params.length}`);
        }
        if (filters.isActive !== undefined) {
          params.push(filters.isActive);
          clauses.push(`is_active = $${params.length}`);
        }
        const result = await queryPage<DataSourceRow>(
          pool,
          'SELECT * FROM data_sources',
          `WHERE ${clauses.join(' AND ')}`,
          params,
          page,
        );
        return { ...result, items: result.items.map(toDataSource) };
      }),

    getById: (id) =>
      guard('dataSources.getById', async () => {
        const { rows } = await pool.query<DataSourceRow>(
          'SELECT * FROM data_sources WHERE id = $1',
          [id],
        );
        return rows[0] === undefined ? null : toDataSource(rows[0]);
      }),

    update: (id, req) =>
      guard('dataSources.update', async () => {
        const sets: string[] = [];
        const params: unknown[] = [id];
        if (req.targetUrl !== undefined) {
          params.push(req.targetUrl);
          sets.push(`target_url = $${params.length}`);
        }
        if (req.refreshIntervalMinutes !== undefined) {
          params.push(req.refreshIntervalMinutes);
          sets.push(`refresh_interval_minutes = $${params.length}`);
        }
        if (req.isActive !== undefined) {
          params.push(req.isActive);
          sets.push(`is_active = $${params.length}`);
        }
        if (sets.length === 0) {
          // No-op update: return the current row untouched (updated_at trigger only fires on UPDATE).
          const { rows } = await pool.query<DataSourceRow>(
            'SELECT * FROM data_sources WHERE id = $1',
            [id],
          );
          return rows[0] === undefined ? null : toDataSource(rows[0]);
        }
        const { rows } = await pool.query<DataSourceRow>(
          `UPDATE data_sources SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
          params,
        );
        return rows[0] === undefined ? null : toDataSource(rows[0]);
      }),

    /** Soft-remove per spec: is_active = false. True if a row was updated. */
    remove: (id) =>
      guard('dataSources.remove', async () => {
        const result = await pool.query('UPDATE data_sources SET is_active = false WHERE id = $1', [
          id,
        ]);
        return (result.rowCount ?? 0) > 0;
      }),

    /** Scheduler queue: active sources that are due (never collected, or past refresh interval). */
    listDue: (now) =>
      guard('dataSources.listDue', async () => {
        const { rows } = await pool.query<DataSourceRow>(
          `SELECT * FROM data_sources
           WHERE is_active = true
             AND (last_collected_at IS NULL
                  OR last_collected_at + make_interval(mins => refresh_interval_minutes) < $1)
           ORDER BY last_collected_at NULLS FIRST`,
          [now],
        );
        return rows.map(toDataSource);
      }),

    markCollected: (id, at) =>
      guard('dataSources.markCollected', async () => {
        await pool.query('UPDATE data_sources SET last_collected_at = $2 WHERE id = $1', [id, at]);
      }),
  };

  const rawSignals: RawSignalRepo = {
    /**
     * Append-only ingest with server-side dedup on (competitor_id, content_hash).
     * ON CONFLICT DO NOTHING + re-SELECT keeps the original row untouched
     * (ingested_at is never rewritten on dedup hits).
     */
    ingest: (req) =>
      guard('rawSignals.ingest', async () => {
        const { rows } = await pool.query<RawSignalRow>(
          `INSERT INTO raw_signals (
             organization_id, competitor_id, data_source_id, source_type,
             raw_text, source_url, collection_method, collected_at, content_hash
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (competitor_id, content_hash) DO NOTHING
           RETURNING *`,
          [
            req.organizationId,
            req.competitorId,
            req.dataSourceId,
            req.sourceType,
            req.rawText,
            req.sourceUrl,
            req.collectionMethod,
            req.collectedAt,
            req.contentHash,
          ],
        );
        if (rows[0] !== undefined) {
          return { signal: toRawSignal(rows[0]), created: true };
        }
        // Dedup hit: fetch the pre-existing row (spec: created=false, 200).
        const existing = await pool.query<RawSignalRow>(
          'SELECT * FROM raw_signals WHERE competitor_id = $1 AND content_hash = $2',
          [req.competitorId, req.contentHash],
        );
        return {
          signal: toRawSignal(requireRow(existing.rows, 'rawSignals.ingest')),
          created: false,
        };
      }),

    getById: (id) =>
      guard('rawSignals.getById', async () => {
        const { rows } = await pool.query<RawSignalRow>('SELECT * FROM raw_signals WHERE id = $1', [
          id,
        ]);
        return rows[0] === undefined ? null : toRawSignal(rows[0]);
      }),

    list: (filters, page) =>
      guard('rawSignals.list', async () => {
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (filters.competitorId !== undefined) {
          params.push(filters.competitorId);
          clauses.push(`competitor_id = $${params.length}`);
        }
        if (filters.sourceType !== undefined) {
          params.push(filters.sourceType);
          clauses.push(`source_type = $${params.length}`);
        }
        if (filters.collectedFrom !== undefined) {
          params.push(filters.collectedFrom);
          clauses.push(`collected_at >= $${params.length}`);
        }
        if (filters.collectedTo !== undefined) {
          params.push(filters.collectedTo);
          clauses.push(`collected_at <= $${params.length}`);
        }
        const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const result = await queryPage<RawSignalRow>(
          pool,
          'SELECT * FROM raw_signals',
          whereSql,
          params,
          page,
        );
        return { ...result, items: result.items.map(toRawSignal) };
      }),

    /** Classification worker queue: raw signals with no corresponding signals row. */
    listUnclassified: (limit) =>
      guard('rawSignals.listUnclassified', async () => {
        const { rows } = await pool.query<RawSignalRow>(
          `SELECT r.*
           FROM raw_signals r
           LEFT JOIN signals s ON s.raw_signal_id = r.id
           WHERE s.id IS NULL
           ORDER BY r.collected_at
           LIMIT $1`,
          [limit],
        );
        return rows.map(toRawSignal);
      }),
  };

  const signals: SignalRepo = {
    /**
     * Stage 1: create the signals row from classification output.
     * Schema quirk: significance_score and routing_decision are NOT NULL with no
     * column defaults, so the insert uses placeholder significance_score = 1 and
     * routing_decision = 'archive'; updateScore/updateRouting overwrite both.
     */
    createFromClassification: (rawSignalId, organizationId, competitorId, req, now) =>
      guard('signals.createFromClassification', async () => {
        const { rows } = await pool.query<SignalRow>(
          `INSERT INTO signals (
             raw_signal_id, organization_id, competitor_id,
             action_type, confidence_level, key_facts, llm_model_used, classified_at,
             -- placeholders below: schema declares both NOT NULL; score/route endpoints overwrite them
             significance_score, routing_decision
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 1, 'archive')
           RETURNING *`,
          [
            rawSignalId,
            organizationId,
            competitorId,
            req.actionType,
            req.confidenceLevel,
            JSON.stringify(req.keyFacts),
            req.llmModelUsed,
            now,
          ],
        );
        return toSignal(requireRow(rows, 'signals.createFromClassification'));
      }),

    /**
     * Stage 2: store factor scores. significance_score is computed in SQL as the
     * sum of the six factors clamped to 1..10 (schema CHECK constraint).
     */
    updateScore: (id, req, now) =>
      guard('signals.updateScore', async () => {
        const { rows } = await pool.query<SignalRow>(
          `UPDATE signals SET
             score_recency = $2::int,
             score_source_authority = $3::int,
             score_action_type = $4::int,
             score_icp_relevance = $5::int,
             score_deal_stage_context = $6::int,
             score_novelty = $7::int,
             significance_score = LEAST(
               GREATEST($2::int + $3::int + $4::int + $5::int + $6::int + $7::int, 1),
               10
             ),
             scored_at = $8
           WHERE id = $1
           RETURNING *`,
          [
            id,
            req.scoreRecency,
            req.scoreSourceAuthority,
            req.scoreActionType,
            req.scoreIcpRelevance,
            req.scoreDealStageContext,
            req.scoreNovelty,
            now,
          ],
        );
        return rows[0] === undefined ? null : toSignal(rows[0]);
      }),

    /** Stage 3: store routing outcome. */
    updateRouting: (id, req, now) =>
      guard('signals.updateRouting', async () => {
        const { rows } = await pool.query<SignalRow>(
          `UPDATE signals SET
             routing_decision = $2,
             battlecard_update_triggered = $3,
             deal_alert_check_triggered = $4,
             routed_at = $5
           WHERE id = $1
           RETURNING *`,
          [
            id,
            req.routingDecision,
            req.battlecardUpdateTriggered,
            req.dealAlertCheckTriggered,
            now,
          ],
        );
        return rows[0] === undefined ? null : toSignal(rows[0]);
      }),

    /** Joined view: signal + raw text/source metadata + competitor name. */
    getById: (id) =>
      guard('signals.getById', async () => {
        const { rows } = await pool.query<SignalDetailRow>(
          `${SIGNAL_DETAIL_SELECT} WHERE s.id = $1`,
          [id],
        );
        return rows[0] === undefined ? null : toSignalDetail(rows[0]);
      }),

    list: (filters, page) =>
      guard('signals.list', async () => {
        const clauses: string[] = [];
        const params: unknown[] = [];
        if (filters.organizationId !== undefined) {
          params.push(filters.organizationId);
          clauses.push(`s.organization_id = $${params.length}`);
        }
        if (filters.competitorId !== undefined) {
          params.push(filters.competitorId);
          clauses.push(`s.competitor_id = $${params.length}`);
        }
        if (filters.actionType !== undefined) {
          params.push(filters.actionType);
          clauses.push(`s.action_type = $${params.length}`);
        }
        if (filters.routingDecision !== undefined) {
          params.push(filters.routingDecision);
          clauses.push(`s.routing_decision = $${params.length}`);
        }
        if (filters.minSignificance !== undefined) {
          params.push(filters.minSignificance);
          clauses.push(`s.significance_score >= $${params.length}`);
        }
        if (filters.maxSignificance !== undefined) {
          params.push(filters.maxSignificance);
          clauses.push(`s.significance_score <= $${params.length}`);
        }
        if (filters.classifiedFrom !== undefined) {
          params.push(filters.classifiedFrom);
          clauses.push(`s.classified_at >= $${params.length}`);
        }
        if (filters.classifiedTo !== undefined) {
          params.push(filters.classifiedTo);
          clauses.push(`s.classified_at <= $${params.length}`);
        }
        if (filters.routedFrom !== undefined) {
          params.push(filters.routedFrom);
          clauses.push(`s.routed_at >= $${params.length}`);
        }
        if (filters.routedTo !== undefined) {
          params.push(filters.routedTo);
          clauses.push(`s.routed_at <= $${params.length}`);
        }
        if (filters.bookmarked !== undefined) {
          params.push(filters.bookmarked);
          clauses.push(`s.bookmarked = $${params.length}`);
        }
        if (filters.search !== undefined && filters.search.trim() !== '') {
          params.push(`%${filters.search.trim()}%`);
          clauses.push(
            `(r.raw_text ILIKE $${params.length} OR s.key_facts::text ILIKE $${params.length})`,
          );
        }
        const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const result = await queryPage<SignalDetailRow>(
          pool,
          SIGNAL_DETAIL_SELECT,
          whereSql,
          params,
          page,
          's.id',
        );
        return { ...result, items: result.items.map(toSignalDetail) };
      }),

    /** Scoring worker queue: classified signals with scored_at IS NULL. */
    listPendingScoring: (limit) =>
      guard('signals.listPendingScoring', async () => {
        const { rows } = await pool.query<SignalRow>(
          `SELECT * FROM signals
           WHERE scored_at IS NULL
           ORDER BY classified_at
           LIMIT $1`,
          [limit],
        );
        return rows.map(toSignal);
      }),

    /** Routing engine queue: scored signals with routed_at IS NULL. */
    listPendingRouting: (limit) =>
      guard('signals.listPendingRouting', async () => {
        const { rows } = await pool.query<SignalRow>(
          `SELECT * FROM signals
           WHERE scored_at IS NOT NULL AND routed_at IS NULL
           ORDER BY scored_at
           LIMIT $1`,
          [limit],
        );
        return rows.map(toSignal);
      }),

    /** Downstream consumer queue (e.g. signal_card alert dispatcher). */
    listRouted: (decision, limit) =>
      guard('signals.listRouted', async () => {
        const { rows } = await pool.query<SignalDetailRow>(
          `${SIGNAL_DETAIL_SELECT}
           WHERE s.routing_decision = $1 AND s.routed_at IS NOT NULL
           ORDER BY s.routed_at DESC
           LIMIT $2`,
          [decision, limit],
        );
        return rows.map(toSignalDetail);
      }),

    /** User bookmark toggle (schema 002). */
    setBookmarked: (id, bookmarked, now) =>
      guard('signals.setBookmarked', async () => {
        // callers pass the timestamp; kept for the repo contract
        void now; // eslint-disable-line no-void
        const { rows } = await pool.query<SignalRow>(
          `UPDATE signals SET bookmarked = $2 WHERE id = $1 RETURNING *`,
          [id, bookmarked],
        );
        return rows[0] === undefined ? null : toSignal(rows[0]);
      }),
  };

  // -------------------------------------------------------------------------
  // Schema 002 repos — users, alert rules, notifications, battlecards
  // -------------------------------------------------------------------------

  const users: UserRepo = {
    create: (organizationId, name, passwordHash) =>
      guard('users.create', async () => {
        const { rows } = await pool.query<UserRow>(
          `INSERT INTO users (organization_id, name, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, organization_id, name, created_at`,
          [organizationId, name, passwordHash],
        );
        return toPublicUser(rows[0]!);
      }),

    findByName: (name) =>
      guard('users.findByName', async () => {
        const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE name = $1 LIMIT 1`, [
          name,
        ]);
        return rows[0] === undefined ? null : toUser(rows[0]);
      }),

    findById: (id) =>
      guard('users.findById', async () => {
        const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [
          id,
        ]);
        return rows[0] === undefined ? null : toUser(rows[0]);
      }),

    count: () =>
      guard('users.count', async () => {
        const { rows } = await pool.query<{ count: string }>(
          'SELECT COUNT(*)::text AS count FROM users',
        );
        return Number(rows[0]?.count ?? 0);
      }),

    getDefaultOrganizationId: () =>
      guard('users.getDefaultOrganizationId', async () => {
        const { rows } = await pool.query<{ id: string }>(
          `SELECT id FROM organizations ORDER BY created_at LIMIT 1`,
        );
        return rows[0]?.id ?? null;
      }),
  };

  const alertRules: AlertRuleRepo = {
    create: (organizationId, req) =>
      guard('alertRules.create', async () => {
        const { rows } = await pool.query<AlertRuleRow>(
          `INSERT INTO alert_rules (organization_id, name, description, enabled, triggers, channels, routing_override)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            organizationId,
            req.name,
            req.description ?? '',
            req.enabled ?? true,
            JSON.stringify(req.triggers ?? {}),
            JSON.stringify(req.channels ?? []),
            req.routingOverride ?? null,
          ],
        );
        return toAlertRule(rows[0]!);
      }),

    list: (organizationId) =>
      guard('alertRules.list', async () => {
        const { rows } = await pool.query<AlertRuleRow>(
          `SELECT * FROM alert_rules WHERE organization_id = $1 ORDER BY created_at`,
          [organizationId],
        );
        return rows.map(toAlertRule);
      }),

    getById: (id) =>
      guard('alertRules.getById', async () => {
        const { rows } = await pool.query<AlertRuleRow>(`SELECT * FROM alert_rules WHERE id = $1`, [
          id,
        ]);
        return rows[0] === undefined ? null : toAlertRule(rows[0]);
      }),

    update: (id, req) =>
      guard('alertRules.update', async () => {
        const current = await pool.query<AlertRuleRow>(`SELECT * FROM alert_rules WHERE id = $1`, [
          id,
        ]);
        const row = current.rows[0];
        if (row === undefined) return null;
        const { rows } = await pool.query<AlertRuleRow>(
          `UPDATE alert_rules
           SET name = $2, description = $3, enabled = $4, triggers = $5, channels = $6,
               routing_override = $7, updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            id,
            req.name ?? row.name,
            req.description ?? row.description,
            req.enabled ?? row.enabled,
            JSON.stringify(req.triggers ?? (row.triggers as AlertRuleTriggers)),
            JSON.stringify(req.channels ?? (row.channels as AlertRuleChannel[])),
            req.routingOverride === undefined ? row.routing_override : req.routingOverride,
          ],
        );
        return toAlertRule(rows[0]!);
      }),

    remove: (id) =>
      guard('alertRules.remove', async () => {
        const { rowCount } = await pool.query('DELETE FROM alert_rules WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
      }),

    incrementFired: (id) =>
      guard('alertRules.incrementFired', async () => {
        await pool.query('UPDATE alert_rules SET fired_count = fired_count + 1 WHERE id = $1', [
          id,
        ]);
      }),
  };

  const notifications: NotificationRepo = {
    create: (input) =>
      guard('notifications.create', async () => {
        const { rows } = await pool.query<NotificationRow>(
          `INSERT INTO notifications (
             organization_id, signal_id, rule_id, title, body, channel, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            input.organizationId,
            input.signalId,
            input.ruleId,
            input.title,
            input.body,
            input.channel,
            input.status,
          ],
        );
        return toNotification(rows[0]!);
      }),

    list: (organizationId, limit) =>
      guard('notifications.list', async () => {
        const { rows } = await pool.query<NotificationRow>(
          `SELECT * FROM notifications
           WHERE organization_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [organizationId, limit],
        );
        return rows.map(toNotification);
      }),

    countUnread: (organizationId) =>
      guard('notifications.countUnread', async () => {
        const { rows } = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM notifications
           WHERE organization_id = $1 AND read_at IS NULL`,
          [organizationId],
        );
        return Number(rows[0]?.count ?? 0);
      }),

    markRead: (id) =>
      guard('notifications.markRead', async () => {
        const { rowCount } = await pool.query(
          `UPDATE notifications SET read_at = now() WHERE id = $1 AND read_at IS NULL`,
          [id],
        );
        return (rowCount ?? 0) > 0;
      }),

    markAllRead: (organizationId) =>
      guard('notifications.markAllRead', async () => {
        await pool.query(
          `UPDATE notifications SET read_at = now() WHERE organization_id = $1 AND read_at IS NULL`,
          [organizationId],
        );
      }),
  };

  const battlecards: BattlecardRepo = {
    upsert: (competitorId, content, now) =>
      guard('battlecards.upsert', async () => {
        const { rows } = await pool.query<BattlecardRow>(
          `INSERT INTO battlecards (competitor_id, content, generated_at, updated_at)
           VALUES ($1, $2, $3, $3)
           ON CONFLICT (competitor_id)
           DO UPDATE SET content = EXCLUDED.content, generated_at = EXCLUDED.generated_at, updated_at = now()
           RETURNING *`,
          [competitorId, JSON.stringify(content), now],
        );
        return toBattlecard(rows[0]!);
      }),

    getByCompetitor: (competitorId) =>
      guard('battlecards.getByCompetitor', async () => {
        const { rows } = await pool.query<BattlecardRow>(
          `SELECT * FROM battlecards WHERE competitor_id = $1`,
          [competitorId],
        );
        return rows[0] === undefined ? null : toBattlecard(rows[0]);
      }),

    appendVersion: (competitorId, trigger, content, sourceSignalCount, triggeredBySignalId, now) =>
      guard('battlecards.appendVersion', async () => {
        const { rows } = await pool.query<BattlecardVersionRow>(
          `INSERT INTO battlecard_versions
             (competitor_id, trigger, content, source_signal_count, triggered_by_signal_id, generated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            competitorId,
            trigger,
            JSON.stringify(content),
            sourceSignalCount,
            triggeredBySignalId,
            now,
          ],
        );
        return toBattlecardVersion(rows[0]!);
      }),

    listVersions: (competitorId, page) =>
      guard('battlecards.listVersions', async () => {
        const { limit } = page;
        const { cursor } = page;
        const params: unknown[] = [competitorId, limit + 1];
        let cursorClause = '';
        if (cursor !== null) {
          params.push(cursor);
          cursorClause = `
            AND (v.generated_at, v.id) < (
              SELECT generated_at, id FROM battlecard_versions WHERE id = $3
            )`;
        }
        const { rows } = await pool.query<BattlecardVersionRow>(
          `SELECT v.* FROM battlecard_versions v
           WHERE v.competitor_id = $1${cursorClause}
           ORDER BY v.generated_at DESC, v.id DESC
           LIMIT $2`,
          params,
        );
        const hasMore = rows.length > page.limit;
        const items = (hasMore ? rows.slice(0, page.limit) : rows).map(toBattlecardVersion);
        return {
          items,
          nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
          limit: page.limit,
        };
      }),

    getVersion: (versionId) =>
      guard('battlecards.getVersion', async () => {
        const { rows } = await pool.query<BattlecardVersionRow>(
          `SELECT * FROM battlecard_versions WHERE id = $1`,
          [versionId],
        );
        return rows[0] === undefined ? null : toBattlecardVersion(rows[0]);
      }),

    listStaleCompetitors: (orgId) =>
      guard('battlecards.listStaleCompetitors', async () => {
        const { rows } = await pool.query<{
          competitor_id: string;
          organization_id: string;
          competitor_name: string;
        }>(
          `SELECT c.id AS competitor_id, c.organization_id, c.name AS competitor_name
           FROM competitors c
           WHERE c.organization_id = $1
             AND EXISTS (
               SELECT 1
               FROM signals s
               WHERE s.competitor_id = c.id
                 AND s.routing_decision = 'signal_card'
                 AND (
                   NOT EXISTS (
                     SELECT 1 FROM battlecards b WHERE b.competitor_id = c.id
                   )
                   OR s.routed_at > (
                     SELECT b.generated_at FROM battlecards b WHERE b.competitor_id = c.id
                   )
                 )
             )`,
          [orgId],
        );
        return rows.map((row) => ({
          competitorId: row.competitor_id,
          organizationId: row.organization_id,
          competitorName: row.competitor_name,
        }));
      }),
  };

  const competitors: CompetitorRepo = {
    create: (organizationId, name) =>
      guard('competitors.create', async () => {
        const { rows } = await pool.query<CompetitorRow>(
          `INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING *`,
          [organizationId, name],
        );
        return toCompetitor(rows[0]!);
      }),

    getById: (id) =>
      guard('competitors.getById', async () => {
        const { rows } = await pool.query<CompetitorRow>(
          `SELECT * FROM competitors WHERE id = $1`,
          [id],
        );
        return rows[0] === undefined ? null : toCompetitor(rows[0]);
      }),

    list: (organizationId) =>
      guard('competitors.list', async () => {
        const { rows } = await pool.query<CompetitorRow>(
          `SELECT * FROM competitors WHERE organization_id = $1 ORDER BY name`,
          [organizationId],
        );
        return rows.map(toCompetitor);
      }),

    updateName: (id, name) =>
      guard('competitors.updateName', async () => {
        const { rows } = await pool.query<CompetitorRow>(
          `UPDATE competitors SET name = $2 WHERE id = $1 RETURNING *`,
          [id, name],
        );
        return rows[0] === undefined ? null : toCompetitor(rows[0]);
      }),

    remove: (id) =>
      guard('competitors.remove', async () => {
        const { rowCount } = await pool.query('DELETE FROM competitors WHERE id = $1', [id]);
        return (rowCount ?? 0) > 0;
      }),
  };

  const competitorProfiles: CompetitorProfileRepo = {
    listProfiles: (organizationId) =>
      guard('competitorProfiles.listProfiles', async () => {
        const { rows } = await pool.query<CompetitorProfileRow>(
          `SELECT c.id, c.organization_id, c.name, c.created_at,
             COUNT(DISTINCT s.id)::int AS signal_count,
             BOOL_OR(ds.is_active) AS monitoring_active,
             COALESCE(
               jsonb_agg(
                 DISTINCT jsonb_build_object('id', ds.id, 'source_type', ds.source_type, 'target_url', ds.target_url)
               ) FILTER (WHERE ds.id IS NOT NULL),
               '[]'::jsonb
             ) AS sources
           FROM competitors c
           LEFT JOIN signals s ON s.competitor_id = c.id
           LEFT JOIN data_sources ds ON ds.competitor_id = c.id
           WHERE c.organization_id = $1
           GROUP BY c.id
           ORDER BY c.name`,
          [organizationId],
        );
        return rows.map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          name: row.name,
          createdAt: toIsoRequired(row.created_at),
          signalCount: row.signal_count,
          monitoringActive: row.monitoring_active ?? false,
          sources: Array.isArray(row.sources)
            ? row.sources.map((s) => ({
                id: s.id as string,
                sourceType: s.source_type as SourceType,
                targetUrl: s.target_url as string | null,
              }))
            : [],
        }));
      }),
  };

  return {
    dataSources,
    rawSignals,
    signals,
    users,
    alertRules,
    notifications,
    battlecards,
    competitors,
    competitorProfiles,
  };
}
