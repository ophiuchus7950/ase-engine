/**
 * Rivela ASE web — API client for the engine backend.
 *
 * Speaks the wire contract from ase_api_spec.md + schema 002: snake_case DTOs,
 * { error, message } envelope. No auth — the engine is a local, single-user
 * app. In dev, Vite proxies /v1 to the local engine (see vite.config.ts).
 */

// ---------------------------------------------------------------------------
// Wire shapes (snake_case, mirror of src/api/dto/schemas.ts in the engine)
// ---------------------------------------------------------------------------

export interface SignalDetailWire {
  id: string;
  raw_signal_id: string;
  organization_id: string;
  competitor_id: string;
  action_type: string;
  confidence_level: 'high' | 'medium' | 'low';
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
  routing_decision: 'signal_card' | 'weekly_digest' | 'archive';
  battlecard_update_triggered: boolean;
  deal_alert_check_triggered: boolean;
  routed_at: string | null;
  bookmarked: boolean;
  created_at: string;
  raw_text: string;
  source_type: string;
  source_url: string | null;
  collected_at: string;
  competitor_name: string;
}

export interface PaginatedWire<T> {
  items: T[];
  next_cursor: string | null;
  limit: number;
}

export interface UserWire {
  id: string;
  organization_id: string;
  name: string;
}

export interface CompetitorWire {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

export interface DataSourceWire {
  id: string;
  organization_id: string;
  competitor_id: string | null;
  source_type: string;
  target_url: string;
  collection_method: string;
  refresh_interval_minutes: number;
  is_active: boolean;
  last_collected_at: string | null;
  created_at: string;
}

export interface CompetitorProfileWire {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
  signal_count: number;
  monitoring_active: boolean | null;
  sources: DataSourceWire[];
}

export interface AlertRuleTriggersWire {
  min_score?: number;
  categories?: string[];
  competitor_ids?: string[];
  keywords?: string[];
}

export interface AlertRuleChannelWire {
  type: 'email' | 'webhook';
  target: string;
}

export interface AlertRuleWire {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  enabled: boolean;
  triggers: AlertRuleTriggersWire;
  channels: AlertRuleChannelWire[];
  routing_override: 'signal_card' | 'weekly_digest' | 'archive' | null;
  fired_count: number;
  created_at: string;
  updated_at: string;
}

export interface NotificationWire {
  id: string;
  organization_id: string;
  signal_id: string | null;
  rule_id: string | null;
  channel: string;
  title: string;
  body: string;
  status: 'delivered' | 'failed' | 'pending';
  read_at: string | null;
  created_at: string;
}

export interface BattlecardWire {
  competitor_id: string;
  competitor_name: string;
  summary: string;
  sections: { heading: string; bullets: string[] }[];
  source_signals: { id: string; title: string; score: number; source_url: string | null }[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_ASE_API_BASE ?? '/v1';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let message = `API ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* non-JSON error body — keep status message */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

function jsonBody(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/** Health endpoint is mounted at /health (outside /v1). */
export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE.replace(/\/v1$/, '')}/health`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<{ status: string }>;
}

// ---------------------------------------------------------------------------
// Signals + bookmarks
// ---------------------------------------------------------------------------

export interface SignalListQuery {
  limit?: number;
  cursor?: string;
  competitor_id?: string;
  action_type?: string;
  confidence_level?: string;
  routing_decision?: string;
  min_significance?: number;
  max_significance?: number;
  bookmarked?: boolean;
  search?: string;
}

/** Fetch one page of classified signals, newest first. Exposes next_cursor. */
export async function fetchSignalsPage(
  query: SignalListQuery = {},
): Promise<PaginatedWire<SignalDetailWire>> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.competitor_id) params.set('competitor_id', query.competitor_id);
  if (query.action_type) params.set('action_type', query.action_type);
  if (query.confidence_level) params.set('confidence_level', query.confidence_level);
  if (query.routing_decision) params.set('routing_decision', query.routing_decision);
  if (query.min_significance !== undefined)
    params.set('min_significance', String(query.min_significance));
  if (query.max_significance !== undefined)
    params.set('max_significance', String(query.max_significance));
  if (query.bookmarked !== undefined) params.set('bookmarked', String(query.bookmarked));
  if (query.search) params.set('search', query.search);
  const qs = params.toString();
  return request<PaginatedWire<SignalDetailWire>>(`/signals${qs ? `?${qs}` : ''}`);
}

/**
 * Fetch classified signals (backward-compatible: returns just the items array
 * for existing callers). New cursor pagination lives on fetchSignalsPage().
 */
export async function fetchSignals(query: SignalListQuery = {}): Promise<SignalDetailWire[]> {
  const page = await fetchSignalsPage(query);
  return page.items;
}

/** Toggle the user bookmark flag on a signal. */
export async function setSignalBookmarked(
  id: string,
  bookmarked: boolean,
): Promise<SignalDetailWire> {
  return request<SignalDetailWire>(`/signals/${id}/bookmark`, jsonBody({ bookmarked }));
}

// ---------------------------------------------------------------------------
// Local identity (no-auth mode): the engine resolves a single local user.
// ---------------------------------------------------------------------------

/** The local user + organization (replaces the old auth endpoints). */
export async function fetchMe(): Promise<{ user: UserWire }> {
  return request<{ user: UserWire }>('/me');
}

// ---------------------------------------------------------------------------
// Competitors (schema 002)
// ---------------------------------------------------------------------------

export async function fetchCompetitors(): Promise<CompetitorProfileWire[]> {
  const res = await request<{ items: CompetitorProfileWire[] }>('/competitors');
  return res.items;
}

export async function createCompetitor(
  name: string,
  websiteUrls: string[],
): Promise<CompetitorWire> {
  return request<CompetitorWire>('/competitors', jsonBody({ name, website_urls: websiteUrls }));
}

export async function renameCompetitor(id: string, name: string): Promise<CompetitorWire> {
  return request<CompetitorWire>(`/competitors/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteCompetitor(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/competitors/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Data sources (phase 1 CRUD) — used by the Monitoring view
// ---------------------------------------------------------------------------

export async function fetchDataSources(organizationId: string): Promise<DataSourceWire[]> {
  const res = await request<{ items: DataSourceWire[] }>(
    `/organizations/${organizationId}/data-sources`,
  );
  return res.items;
}

export async function createDataSource(
  organizationId: string,
  body: {
    competitor_id: string | null;
    source_type: string;
    target_url: string;
    collection_method: string;
    refresh_interval_minutes: number;
  },
): Promise<DataSourceWire> {
  return request<DataSourceWire>(`/organizations/${organizationId}/data-sources`, jsonBody(body));
}

export async function deleteDataSource(
  organizationId: string,
  id: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/organizations/${organizationId}/data-sources/${id}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Alert rules (schema 002)
// ---------------------------------------------------------------------------

export async function fetchAlertRules(): Promise<AlertRuleWire[]> {
  const res = await request<{ items: AlertRuleWire[] }>('/alert-rules');
  return res.items;
}

export interface CreateAlertRuleBody {
  name: string;
  description?: string;
  enabled?: boolean;
  triggers?: AlertRuleTriggersWire;
  channels?: AlertRuleChannelWire[];
  routing_override?: 'signal_card' | 'weekly_digest' | 'archive' | null;
}

export async function createAlertRule(body: CreateAlertRuleBody): Promise<AlertRuleWire> {
  return request<AlertRuleWire>('/alert-rules', jsonBody(body));
}

export async function updateAlertRule(
  id: string,
  body: Partial<CreateAlertRuleBody>,
): Promise<AlertRuleWire> {
  return request<AlertRuleWire>(`/alert-rules/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteAlertRule(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/alert-rules/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Notifications (schema 002, the bell)
// ---------------------------------------------------------------------------

export async function fetchNotifications(limit = 50): Promise<NotificationWire[]> {
  const res = await request<{ items: NotificationWire[] }>(`/notifications?limit=${limit}`);
  return res.items;
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await request<{ count: number }>('/notifications/unread-count');
  return res.count;
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Battlecards (schema 002)
// ---------------------------------------------------------------------------

export async function fetchBattlecard(competitorId: string): Promise<BattlecardWire> {
  return request<BattlecardWire>(`/competitors/${competitorId}/battlecard`);
}

export async function updateBattlecard(competitorId: string): Promise<BattlecardWire> {
  return request<BattlecardWire>(`/competitors/${competitorId}/battlecard/update`, {
    method: 'POST',
  });
}

export interface BattlecardVersionWire {
  id: string;
  trigger: 'routing' | 'worker' | 'manual' | 'startup';
  generated_at: string;
  source_signal_count: number;
  summary: string;
  sections: { heading: string; bullets: string[] }[];
  source_signals: { id: string; title: string; score: number; source_url: string | null }[];
}

/** Fetch a competitor's battlecard version history (cursor-paginated). */
export async function fetchBattlecardHistory(
  competitorId: string,
  cursor?: string,
): Promise<PaginatedWire<BattlecardVersionWire>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return request<PaginatedWire<BattlecardVersionWire>>(
    `/competitors/${competitorId}/battlecard/history${qs ? `?${qs}` : ''}`,
  );
}
