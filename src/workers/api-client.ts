import { z } from 'zod';

import type {
  ActionType,
  ApiError,
  ConfidenceLevel,
  DataSource,
  Paginated,
  RawSignal,
  RoutingDecision,
  Signal,
  SignalDetail,
  SourceType,
} from '../types/domain';
import { ApiClientError } from './api-client-error';

export { ApiClientError } from './api-client-error';

/**
 * Internal API client used by all four workers (ase_api_spec.md).
 * Wire is snake_case; this module converts at the boundary (standards §2):
 * request payloads are snake_case wire objects, responses are mapped to the
 * camelCase domain types. 15s timeout, X-API-Key auth, typed ApiClientError
 * carrying the status + {error, message} envelope on non-2xx.
 */

// ---------------------------------------------------------------------------
// Wire shapes (snake_case, per ase_api_spec.md)
// ---------------------------------------------------------------------------

export interface IngestRawSignalPayload {
  organization_id: string;
  competitor_id: string;
  data_source_id: string | null;
  source_type: SourceType;
  raw_text: string;
  source_url: string | null;
  collection_method: string;
  collected_at: string;
  content_hash: string;
}

export interface ClassifyPayload {
  action_type: ActionType;
  confidence_level: ConfidenceLevel;
  key_facts: string[];
  llm_model_used: string;
}

export interface ScorePayload {
  score_recency: number;
  score_source_authority: number;
  score_action_type: number;
  score_icp_relevance: number;
  score_deal_stage_context: number;
  score_novelty: number;
}

export interface RoutePayload {
  routing_decision: RoutingDecision;
  battlecard_update_triggered: boolean;
  deal_alert_check_triggered: boolean;
}

interface DataSourceWire {
  id: string;
  organization_id: string;
  competitor_id: string | null;
  source_type: SourceType;
  target_url: string | null;
  collection_method: string;
  refresh_interval_minutes: number;
  is_active: boolean;
  last_collected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RawSignalWire {
  id: string;
  organization_id: string;
  competitor_id: string;
  data_source_id: string | null;
  source_type: SourceType;
  raw_text: string;
  source_url: string | null;
  collection_method: string;
  collected_at: string;
  content_hash: string;
  ingested_at: string;
}

interface SignalWire {
  id: string;
  raw_signal_id: string;
  organization_id: string;
  competitor_id: string;
  action_type: ActionType;
  confidence_level: ConfidenceLevel;
  key_facts: string[];
  llm_model_used: string | null;
  classified_at: string | null;
  score_recency: number;
  score_source_authority: number;
  score_action_type: number;
  score_icp_relevance: number;
  score_deal_stage_context: number;
  score_novelty: number;
  significance_score: number;
  scored_at: string | null;
  routing_decision: RoutingDecision;
  battlecard_update_triggered: boolean;
  deal_alert_check_triggered: boolean;
  routed_at: string | null;
  bookmarked?: boolean;
  created_at: string;
}

interface SignalDetailWire extends SignalWire {
  raw_text: string;
  source_type: SourceType;
  source_url: string | null;
  collected_at: string;
  competitor_name: string;
}

// ---------------------------------------------------------------------------
// Mappers: wire (snake_case) -> domain (camelCase)
// ---------------------------------------------------------------------------

function toDataSource(w: DataSourceWire): DataSource {
  return {
    id: w.id,
    organizationId: w.organization_id,
    competitorId: w.competitor_id,
    sourceType: w.source_type,
    targetUrl: w.target_url,
    collectionMethod: w.collection_method,
    refreshIntervalMinutes: w.refresh_interval_minutes,
    isActive: w.is_active,
    lastCollectedAt: w.last_collected_at,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

function toRawSignal(w: RawSignalWire): RawSignal {
  return {
    id: w.id,
    organizationId: w.organization_id,
    competitorId: w.competitor_id,
    dataSourceId: w.data_source_id,
    sourceType: w.source_type,
    rawText: w.raw_text,
    sourceUrl: w.source_url,
    collectionMethod: w.collection_method,
    collectedAt: w.collected_at,
    contentHash: w.content_hash,
    ingestedAt: w.ingested_at,
  };
}

function toSignal(w: SignalWire): Signal {
  return {
    id: w.id,
    rawSignalId: w.raw_signal_id,
    organizationId: w.organization_id,
    competitorId: w.competitor_id,
    actionType: w.action_type,
    confidenceLevel: w.confidence_level,
    keyFacts: w.key_facts,
    llmModelUsed: w.llm_model_used,
    classifiedAt: w.classified_at,
    scoreRecency: w.score_recency,
    scoreSourceAuthority: w.score_source_authority,
    scoreActionType: w.score_action_type,
    scoreIcpRelevance: w.score_icp_relevance,
    scoreDealStageContext: w.score_deal_stage_context,
    scoreNovelty: w.score_novelty,
    significanceScore: w.significance_score,
    bookmarked: w.bookmarked ?? false,
    scoredAt: w.scored_at,
    routingDecision: w.routing_decision,
    battlecardUpdateTriggered: w.battlecard_update_triggered,
    dealAlertCheckTriggered: w.deal_alert_check_triggered,
    routedAt: w.routed_at,
    createdAt: w.created_at,
  };
}

function toSignalDetail(w: SignalDetailWire): SignalDetail {
  return {
    ...toSignal(w),
    rawText: w.raw_text,
    sourceType: w.source_type,
    sourceUrl: w.source_url,
    collectedAt: w.collected_at,
    competitorName: w.competitor_name,
  };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

const REQUEST_TIMEOUT_MS = 15_000;

/** Parse a non-2xx response body into a typed ApiClientError. */
async function buildError(
  response: Response,
  method: string,
  path: string,
): Promise<ApiClientError> {
  let body: ApiError | null = null;
  try {
    const raw: unknown = await response.json();
    const parsed = ApiErrorSchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    // Non-JSON error body — leave `body` null.
  }
  return new ApiClientError(
    `API ${method} ${path} failed with status ${response.status}`,
    response.status,
    body,
  );
}

export class ApiClient {
  private readonly baseUrl: string;

  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  /** Scheduler queue: data sources due for collection. */
  async listDueSources(limit = 100): Promise<DataSource[]> {
    const data = await this.requestJson<Paginated<DataSourceWire>>(
      'GET',
      `/v1/data-sources/due?limit=${limit}`,
    );
    return (data?.items ?? []).map(toDataSource);
  }

  /** Confirm a collection run completed (sets last_collected_at = now server-side). */
  async markCollected(id: string): Promise<void> {
    await this.requestJson<unknown>('POST', `/v1/data-sources/${id}/mark-collected`);
  }

  /**
   * Ingest one normalized raw signal. Server dedups on (competitor_id,
   * content_hash): 201 = new row, 200 = already seen (existing record
   * returned). The HTTP status IS the created flag (ase_api_spec.md §2).
   */
  async ingestRawSignal(
    payload: IngestRawSignalPayload,
  ): Promise<{ signal: RawSignal; created: boolean }> {
    const { status, data } = await this.requestDetailed<RawSignalWire>(
      'POST',
      '/v1/raw-signals',
      payload,
    );
    if (data === null) {
      throw new ApiClientError('POST /v1/raw-signals returned an empty body', status, null);
    }
    return { signal: toRawSignal(data), created: status === 201 };
  }

  /** Classification worker queue: raw signals with no signals row yet. */
  async listUnclassified(limit: number): Promise<RawSignal[]> {
    const data = await this.requestJson<Paginated<RawSignalWire>>(
      'GET',
      `/v1/raw-signals/unclassified?limit=${limit}`,
    );
    return (data?.items ?? []).map(toRawSignal);
  }

  /** Stage 1: submit LLM classification output for a raw signal. */
  async submitClassification(rawSignalId: string, payload: ClassifyPayload): Promise<void> {
    await this.requestJson<unknown>('POST', `/v1/raw-signals/${rawSignalId}/classify`, payload);
  }

  /** Scoring worker queue: classified signals with no score yet. */
  async listPendingScoring(limit: number): Promise<Signal[]> {
    const data = await this.requestJson<Paginated<SignalWire>>(
      'GET',
      `/v1/signals/pending-scoring?limit=${limit}`,
    );
    return (data?.items ?? []).map(toSignal);
  }

  /** Joined signal view (classification + score + routing + raw text). */
  async getSignal(id: string): Promise<SignalDetail> {
    const data = await this.requestJson<SignalDetailWire>('GET', `/v1/signals/${id}`);
    if (data === null) {
      throw new ApiClientError(`GET /v1/signals/${id} returned an empty body`, 200, null);
    }
    return toSignalDetail(data);
  }

  /** Stage 2: submit factor scores (server computes + clamps significance_score). */
  async submitScore(id: string, payload: ScorePayload): Promise<void> {
    await this.requestJson<unknown>('POST', `/v1/signals/${id}/score`, payload);
  }

  /** Routing engine queue: scored signals with no routing decision yet. */
  async listPendingRouting(limit: number): Promise<Signal[]> {
    const data = await this.requestJson<Paginated<SignalWire>>(
      'GET',
      `/v1/signals/pending-routing?limit=${limit}`,
    );
    return (data?.items ?? []).map(toSignal);
  }

  /** Stage 3: submit the routing outcome. */
  async submitRoute(id: string, payload: RoutePayload): Promise<void> {
    await this.requestJson<unknown>('POST', `/v1/signals/${id}/route`, payload);
  }

  /** Downstream consumer queue, filtered by routing decision. */
  async listRouted(decision: RoutingDecision, limit = 100): Promise<SignalDetail[]> {
    const data = await this.requestJson<Paginated<SignalDetailWire>>(
      'GET',
      `/v1/signals/routed?routing_decision=${decision}&limit=${limit}`,
    );
    return (data?.items ?? []).map(toSignalDetail);
  }

  /**
   * Battlecard reconciliation (Workstream A, schema 003): regenerate every
   * stale competitor battlecard under trigger='worker', newest provenance first.
   */
  async reconcileBattlecards(): Promise<{ regenerated: number; competitors: string[] }> {
    const data = await this.requestJson<{
      regenerated: number;
      competitors: { competitor_id: string; competitor_name: string }[];
    }>('POST', '/v1/battlecards/reconcile');
    return {
      regenerated: data?.regenerated ?? 0,
      competitors: (data?.competitors ?? []).map((c) => c.competitor_name),
    };
  }

  private async requestJson<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    return (await this.requestDetailed<T>(method, path, body)).data;
  }

  private async requestDetailed<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T | null }> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'X-API-Key': this.apiKey,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new ApiClientError(`Network error on ${method} ${path}`, null, null, err);
    }

    if (!response.ok) {
      throw await buildError(response, method, path);
    }

    const text = await response.text();
    if (text.length === 0) return { status: response.status, data: null };

    try {
      return { status: response.status, data: JSON.parse(text) as T };
    } catch (err) {
      throw new ApiClientError(
        `Invalid JSON response from ${method} ${path}`,
        response.status,
        null,
        err,
      );
    }
  }
}
