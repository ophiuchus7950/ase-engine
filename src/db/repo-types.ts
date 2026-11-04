import type { Pool } from 'pg';
import type {
  ActionType,
  AlertRule,
  Battlecard,
  BattlecardContent,
  BattlecardTrigger,
  BattlecardVersion,
  ClassifyRequest,
  Competitor,
  CompetitorProfile,
  CreateAlertRuleRequest,
  CreateDataSourceRequest,
  DataSource,
  IngestRawSignalRequest,
  Notification,
  Paginated,
  PublicUser,
  RawSignal,
  RouteRequest,
  RoutingDecision,
  ScoreRequest,
  Signal,
  SignalDetail,
  SourceType,
  UpdateAlertRuleRequest,
  UpdateDataSourceRequest,
  User,
} from '../types/domain';

/**
 * Repo interface contract — the single shared boundary between the db layer
 * (implementation: src/db/*.repo.ts) and the api layer (src/api/**).
 * Signature changes here ripple everywhere; keep in sync with src/types/domain.ts.
 */

export interface DataSourceFilters {
  competitorId?: string;
  sourceType?: SourceType;
  isActive?: boolean;
}

export interface RawSignalFilters {
  competitorId?: string;
  sourceType?: SourceType;
  collectedFrom?: string;
  collectedTo?: string;
}

export interface SignalFilters {
  organizationId?: string;
  competitorId?: string;
  actionType?: ActionType;
  routingDecision?: RoutingDecision;
  minSignificance?: number;
  maxSignificance?: number;
  classifiedFrom?: string;
  classifiedTo?: string;
  routedFrom?: string;
  routedTo?: string;
  /** ?bookmarked=true — user-bookmarked signals only. */
  bookmarked?: boolean;
  /** ?search= — case-insensitive match on raw text / key facts / source url. */
  search?: string;
}

export interface PageParams {
  limit: number; // 1..100
  cursor: string | null; // opaque id cursor (id > cursor)
}

export interface DataSourceRepo {
  create(organizationId: string, req: CreateDataSourceRequest): Promise<DataSource>;
  list(
    organizationId: string,
    filters: DataSourceFilters,
    page: PageParams,
  ): Promise<Paginated<DataSource>>;
  getById(id: string): Promise<DataSource | null>;
  update(id: string, req: UpdateDataSourceRequest): Promise<DataSource | null>;
  /** Soft-remove: sets is_active = false. Returns true if a row was updated. */
  remove(id: string): Promise<boolean>;
  /** Scheduler queue: is_active AND last_collected_at + refresh_interval_minutes < now. */
  listDue(now: Date): Promise<DataSource[]>;
  markCollected(id: string, at: Date): Promise<void>;
}

export interface RawSignalRepo {
  /**
   * Append-only ingest with server-side dedup on (competitor_id, content_hash).
   * Returns the created row + whether it was new (201) or already seen (200).
   */
  ingest(req: IngestRawSignalRequest): Promise<{ signal: RawSignal; created: boolean }>;
  getById(id: string): Promise<RawSignal | null>;
  list(filters: RawSignalFilters, page: PageParams): Promise<Paginated<RawSignal>>;
  /** Classification worker queue: raw signals with no corresponding signals row. */
  listUnclassified(limit: number): Promise<RawSignal[]>;
}

export interface SignalRepo {
  /**
   * Stage 1: create the signals row from classification output.
   * NOTE: schema declares significance_score + routing_decision NOT NULL, so the
   * insert uses placeholder significance_score=1 and routing_decision='archive';
   * the score/route endpoints overwrite both. classified_at = now.
   */
  createFromClassification(
    rawSignalId: string,
    organizationId: string,
    competitorId: string,
    req: ClassifyRequest,
    now: Date,
  ): Promise<Signal>;
  /**
   * Stage 2: store factor scores; server computes significance_score =
   * sum of the six factors, clamped to 1..10 (schema CHECK). scored_at = now.
   */
  updateScore(id: string, req: ScoreRequest, now: Date): Promise<Signal | null>;
  /** Stage 3: store routing outcome. routed_at = now. */
  updateRouting(id: string, req: RouteRequest, now: Date): Promise<Signal | null>;
  /** Joined view: signal + raw_text/source metadata + competitor name. */
  getById(id: string): Promise<SignalDetail | null>;
  list(filters: SignalFilters, page: PageParams): Promise<Paginated<SignalDetail>>;
  /** Toggle the user bookmark flag. Returns the updated signal or null. */
  setBookmarked(id: string, bookmarked: boolean, now: Date): Promise<Signal | null>;
  /** Scoring worker queue: classified signals with scored_at IS NULL. */
  listPendingScoring(limit: number): Promise<Signal[]>;
  /** Routing engine queue: scored signals with routed_at IS NULL. */
  listPendingRouting(limit: number): Promise<Signal[]>;
  /** Downstream consumer queue (e.g. signal_card alert dispatcher). */
  listRouted(decision: RoutingDecision, limit: number): Promise<SignalDetail[]>;
}

export interface UserRepo {
  /** First-run registration (single-user MVP): create the first account. */
  create(organizationId: string, name: string, passwordHash: string): Promise<PublicUser>;
  findByName(name: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Number of registered users (0 => allow first-run registration). */
  count(): Promise<number>;
  /** The org new accounts belong to — first org by creation (seeded org). */
  getDefaultOrganizationId(): Promise<string | null>;
}

export interface AlertRuleRepo {
  create(organizationId: string, req: CreateAlertRuleRequest): Promise<AlertRule>;
  list(organizationId: string): Promise<AlertRule[]>;
  getById(id: string): Promise<AlertRule | null>;
  update(id: string, req: UpdateAlertRuleRequest): Promise<AlertRule | null>;
  remove(id: string): Promise<boolean>;
  /** Increment fired_count when a rule matches a signal. */
  incrementFired(id: string): Promise<void>;
}

export interface NotificationRepo {
  create(org: NotificationInput): Promise<Notification>;
  list(organizationId: string, limit: number): Promise<Notification[]>;
  /** Unread count for the bell badge. */
  countUnread(organizationId: string): Promise<number>;
  markRead(id: string): Promise<boolean>;
  markAllRead(organizationId: string): Promise<void>;
}

export interface NotificationInput {
  organizationId: string;
  signalId: string | null;
  ruleId: string | null;
  title: string;
  body: string;
  channel: string;
  status: 'delivered' | 'failed' | 'pending';
}

export interface BattlecardRepo {
  upsert(competitorId: string, content: BattlecardContent, now: Date): Promise<Battlecard>;
  getByCompetitor(competitorId: string): Promise<Battlecard | null>;
  /** Append a schema-003 history entry snapshotting a regeneration. */
  appendVersion(
    competitorId: string,
    trigger: BattlecardTrigger,
    content: BattlecardContent,
    sourceSignalCount: number,
    triggeredBySignalId: string | null,
    now: Date,
  ): Promise<BattlecardVersion>;
  /** History for a competitor, newest-first (paginated). */
  listVersions(competitorId: string, page: PageParams): Promise<Paginated<BattlecardVersion>>;
  getVersion(versionId: string): Promise<BattlecardVersion | null>;
  /**
   * Competitors whose battlecard is stale (schema 003 reconciliation): has a
   * signal_card signal routed after the current battlecard's generated_at, or
   * has a signal_card signal but no battlecard yet.
   */
  listStaleCompetitors(
    orgId: string,
  ): Promise<Array<{ competitorId: string; organizationId: string; competitorName: string }>>;
}

export interface CompetitorRepo {
  create(organizationId: string, name: string): Promise<Competitor>;
  getById(id: string): Promise<Competitor | null>;
  list(organizationId: string): Promise<Competitor[]>;
  updateName(id: string, name: string): Promise<Competitor | null>;
  /** Hard delete — FKs cascade data_sources, raw_signals, signals, battlecards. */
  remove(id: string): Promise<boolean>;
}

export interface CompetitorProfileRepo {
  /** Competitors + signal counts + active data sources (Competitors view). */
  listProfiles(organizationId: string): Promise<CompetitorProfile[]>;
}

export interface Repos {
  dataSources: DataSourceRepo;
  rawSignals: RawSignalRepo;
  signals: SignalRepo;
  users: UserRepo;
  alertRules: AlertRuleRepo;
  notifications: NotificationRepo;
  battlecards: BattlecardRepo;
  competitors: CompetitorRepo;
  competitorProfiles: CompetitorProfileRepo;
}

/** Factory type — implemented in src/db/repos.ts as `createRepos(pool)`. Pool-injectable for test isolation. */
export type CreateRepos = (pool: Pool) => Repos;
