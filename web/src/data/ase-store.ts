/**
 * Rivela ASE web — live data store (schema 002).
 *
 * Renders instantly with the design's mock data, then swaps in live engine
 * data (signals, competitor profiles, alert rules, notifications, session) as
 * soon as the API responds. Views subscribe via useAseData(); refresh() is
 * called on mount and on an interval so the feed tracks the engine's workers
 * in near-real-time. Each slice falls back to its mock data when the API is
 * unreachable, so the app stays usable in demo mode.
 */

import { useSyncExternalStore } from 'react';
import {
  clearSession,
  createAlertRule,
  createCompetitor as apiCreateCompetitor,
  deleteAlertRule,
  deleteCompetitor as apiDeleteCompetitor,
  fetchAlertRules,
  fetchBattlecardHistory,
  fetchCompetitors,
  fetchMe,
  fetchNotifications,
  fetchSignals,
  fetchSignalsPage,
  fetchUnreadCount,
  getSession,
  login as apiLogin,
  markAllNotificationsRead,
  markNotificationRead,
  registerAccount as apiRegister,
  setSession,
  setSignalBookmarked,
  updateAlertRule,
  updateBattlecard,
} from '../api/client';
import type {
  AlertRuleTriggersWire,
  AlertRuleWire,
  BattlecardWire,
  CreateAlertRuleBody,
  SignalListQuery,
  UserWire,
} from '../api/client';
import {
  deriveActivity,
  deriveCompetitorBars,
  deriveCompetitors,
  mapSignal,
  profileToCompetitor,
} from '../api/mappers';
import {
  ACTIVITY_DATA,
  ALERT_RULES,
  COMPETITOR_BARS,
  COMPETITORS,
  NOTIFICATIONS,
  SIGNALS,
  UNREAD_COUNT,
} from './mock';
import type { AseData, BattlecardVersionRow, RuleDraft } from '../types/design';

export { clearSession, getSession, setSession };

const initialSession = getSession();

let data: AseData = {
  signals: SIGNALS,
  activitySignals: [],
  signalsCursor: null,
  hasMore: false,
  battlecardHistory: {},
  competitors: COMPETITORS,
  activity: ACTIVITY_DATA,
  competitorBars: COMPETITOR_BARS,
  rules: ALERT_RULES,
  notifications: NOTIFICATIONS,
  unreadCount: UNREAD_COUNT,
  user: initialSession?.user ?? null,
  session: initialSession,
  live: false,
  loading: false,
  lastSync: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): AseData {
  return data;
}

/** Filter set currently driving the Activity feed's cursor-paginated slice. */
let activityQuery: SignalListQuery = { limit: 50 };

/**
 * Load the first page of the Activity feed for the given filter set. Resets the
 * cursor and replaces the accumulated list so "Load more" pages onto this
 * query. Used by the Activity view whenever its filters change.
 */
export async function loadActivitySignals(query: SignalListQuery): Promise<void> {
  activityQuery = { ...query, limit: query.limit ?? 50 };
  try {
    const page = await fetchSignalsPage(activityQuery);
    const signals = page.items.map(mapSignal);
    data = {
      ...data,
      activitySignals: signals,
      signalsCursor: page.next_cursor,
      hasMore: !!page.next_cursor,
    };
    emit();
  } catch {
    // Engine unreachable — keep whatever Activity slice was showing.
  }
}

/** Append the next cursor page to the Activity feed (no-op when exhausted). */
export async function loadMoreSignals(): Promise<void> {
  if (!data.signalsCursor) return;
  try {
    const page = await fetchSignalsPage({ ...activityQuery, cursor: data.signalsCursor });
    const existing = new Set(data.activitySignals.map((s) => s.id));
    const appended = page.items.filter((s) => !existing.has(s.id)).map(mapSignal);
    data = {
      ...data,
      activitySignals: [...data.activitySignals, ...appended],
      signalsCursor: page.next_cursor,
      hasMore: !!page.next_cursor,
    };
    emit();
  } catch {
    // Non-fatal — keep the current page, user can retry.
  }
}

/** Map a battlecard version wire onto the design's history-row shape. */
function toVersionRow(
  v: Awaited<ReturnType<typeof fetchBattlecardHistory>>['items'][number],
): BattlecardVersionRow {
  return {
    id: v.id,
    trigger: v.trigger,
    generatedAt: v.generated_at,
    sourceSignalCount: v.source_signal_count,
    summary: v.summary,
    sections: v.sections,
    sourceSignals: v.source_signals.map((s) => ({
      id: s.id,
      title: s.title,
      score: s.score,
      sourceUrl: s.source_url,
    })),
  };
}

/** Load (or reload) a competitor's battlecard version history into the slice. */
export async function fetchBattlecardHistoryFor(competitorId: string): Promise<void> {
  try {
    const page = await fetchBattlecardHistory(competitorId);
    const rows = page.items.map(toVersionRow);
    data = {
      ...data,
      battlecardHistory: { ...data.battlecardHistory, [competitorId]: rows },
    };
    emit();
  } catch {
    // Keep whatever history slice exists (or none).
  }
}

// ---------------------------------------------------------------------------
// Slice refreshers — each swaps its slice for live data and is a no-op on
// API failure (the mock/demo slice keeps rendering). refresh() runs them in
// order so live competitor profiles win over the signal-derived ones.
// ---------------------------------------------------------------------------

/** Swap in live signals + derived views. Keeps mock when the engine is empty. */
async function refreshSignals(): Promise<void> {
  try {
    const wires = await fetchSignals({ limit: 100 });
    if (wires.length === 0) return; // keep mock/demo data if engine is empty
    const signals = wires.map(mapSignal);
    const competitors = deriveCompetitors(signals);
    data = {
      ...data,
      signals,
      competitors,
      activity: deriveActivity(signals),
      competitorBars: deriveCompetitorBars(competitors),
      live: true,
    };
    emit();
  } catch {
    // Engine unreachable (e.g. dev without backend) — keep mock data.
  }
}

/** Swap in live competitor profiles (schema 002 /v1/competitors). */
export async function refreshCompetitors(): Promise<void> {
  try {
    const profiles = await fetchCompetitors();
    const competitors = profiles.map((p, i) => profileToCompetitor(p, i));
    data = {
      ...data,
      competitors,
      competitorBars: deriveCompetitorBars(competitors),
      live: true,
    };
    emit();
  } catch {
    // Keep whatever competitors are showing (mock or signal-derived).
  }
}

/** Swap in live alert rules (schema 002 /v1/alert-rules). */
export async function refreshRules(): Promise<void> {
  try {
    const rules = await fetchAlertRules();
    data = { ...data, rules, live: true };
    emit();
  } catch {
    // Keep mock rules.
  }
}

/** Swap in live notifications + unread badge (schema 002 /v1/notifications). */
export async function refreshNotifications(): Promise<void> {
  try {
    const [notifications, unreadCount] = await Promise.all([
      fetchNotifications(50),
      fetchUnreadCount(),
    ]);
    data = { ...data, notifications, unreadCount, live: true };
    emit();
  } catch {
    // Keep mock notifications.
  }
}

/** Re-validate the stored session against the backend and refresh the user. */
export async function refreshSession(): Promise<void> {
  const session = getSession();
  if (!session) return;
  try {
    const { user } = await fetchMe();
    const refreshed = { token: session.token, user };
    setSession(refreshed);
    data = { ...data, session: refreshed, user };
    emit();
  } catch {
    // Backend unreachable or token expired — keep the stored session.
  }
}

/**
 * Fetch live signals and rebuild derived views, then swap in the other
 * schema-002 slices (competitors, rules, notifications, session). One call
 * loads everything; each slice falls back to its mock data on API failure.
 */
export async function refresh(): Promise<void> {
  data = { ...data, loading: true };
  emit();
  await refreshSignals();
  await refreshCompetitors();
  if (data.activitySignals.length === 0) await loadActivitySignals({ limit: 50 });
  await refreshRules();
  await refreshNotifications();
  await refreshSession();
  data = {
    ...data,
    loading: false,
    lastSync: data.live ? new Date().toISOString() : data.lastSync,
  };
  emit();
}

// ---------------------------------------------------------------------------
// Session / auth — persist the Bearer token + user via the client, and keep
// the in-memory snapshot in sync so the sidebar can render the user.
// ---------------------------------------------------------------------------

/** Register the first account and persist the returned session. */
export async function register(name: string, password: string): Promise<UserWire> {
  const res = await apiRegister(name, password);
  const session = { token: res.token, user: res.user };
  setSession(session);
  data = { ...data, session, user: res.user };
  emit();
  return res.user;
}

/** Log in and persist the returned session. */
export async function login(name: string, password: string): Promise<UserWire> {
  const res = await apiLogin(name, password);
  const session = { token: res.token, user: res.user };
  setSession(session);
  data = { ...data, session, user: res.user };
  emit();
  return res.user;
}

/** Log out locally: clears the persisted token and the in-memory session. */
export function logout(): void {
  clearSession();
  data = { ...data, session: null, user: null };
  emit();
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

/** Create a monitored competitor, then pull the refreshed profile list. */
export async function addCompetitor(name: string, urls: string[]): Promise<void> {
  await apiCreateCompetitor(name, urls);
  await refreshCompetitors();
}

/** Delete a competitor, then pull the refreshed profile list. */
export async function deleteCompetitor(id: string): Promise<void> {
  await apiDeleteCompetitor(id);
  await refreshCompetitors();
}

// ---------------------------------------------------------------------------
// Alert rules
// ---------------------------------------------------------------------------

/** Map the UI draft shape onto the schema-002 create/patch body. */
function toCreateBody(draft: RuleDraft): CreateAlertRuleBody {
  const triggers: AlertRuleTriggersWire = {};
  if (draft.minScore !== undefined) triggers.min_score = draft.minScore;
  if (draft.categories?.length) triggers.categories = draft.categories;
  if (draft.competitorIds?.length) triggers.competitor_ids = draft.competitorIds;
  if (draft.keywords?.length) triggers.keywords = draft.keywords;
  return {
    name: draft.name,
    description: draft.description,
    enabled: draft.enabled,
    channels: draft.channels,
    routing_override: draft.routingOverride ?? null,
    triggers: Object.keys(triggers).length > 0 ? triggers : undefined,
  };
}

/** Create an alert rule and prepend it to the live slice. */
export async function createRule(draft: RuleDraft): Promise<AlertRuleWire> {
  const rule = await createAlertRule(toCreateBody(draft));
  data = { ...data, rules: [rule, ...data.rules] };
  emit();
  return rule;
}

/** Patch an alert rule in place. */
export async function updateRule(id: string, draft: RuleDraft): Promise<AlertRuleWire> {
  const rule = await updateAlertRule(id, toCreateBody(draft));
  data = { ...data, rules: data.rules.map((r) => (r.id === id ? rule : r)) };
  emit();
  return rule;
}

/** Delete an alert rule from the live slice. */
export async function deleteRule(id: string): Promise<void> {
  await deleteAlertRule(id);
  data = { ...data, rules: data.rules.filter((r) => r.id !== id) };
  emit();
}

// ---------------------------------------------------------------------------
// Notifications (the bell)
// ---------------------------------------------------------------------------

/** Mark a single notification read. */
export async function markRead(id: string): Promise<void> {
  await markNotificationRead(id);
  const target = data.notifications.find((n) => n.id === id);
  if (!target) return;
  const wasUnread = target.read_at === null;
  data = {
    ...data,
    notifications: data.notifications.map((n) =>
      n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n,
    ),
    unreadCount: wasUnread ? Math.max(0, data.unreadCount - 1) : data.unreadCount,
  };
  emit();
}

/** Mark every notification read (bell "mark all"). */
export async function markAllRead(): Promise<void> {
  await markAllNotificationsRead();
  data = {
    ...data,
    notifications: data.notifications.map((n) => ({
      ...n,
      read_at: n.read_at ?? new Date().toISOString(),
    })),
    unreadCount: 0,
  };
  emit();
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

/** Optimistically toggle a signal's bookmark, reverting if the API fails. */
export async function toggleBookmark(signalId: string): Promise<void> {
  const signal = data.signals.find((s) => s.id === signalId);
  if (!signal) return;
  const next = !signal.isBookmarked;
  data = {
    ...data,
    signals: data.signals.map((s) => (s.id === signalId ? { ...s, isBookmarked: next } : s)),
  };
  emit();
  try {
    await setSignalBookmarked(signalId, next);
  } catch (err) {
    data = {
      ...data,
      signals: data.signals.map((s) =>
        s.id === signalId ? { ...s, isBookmarked: signal.isBookmarked } : s,
      ),
    };
    emit();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Battlecards
// ---------------------------------------------------------------------------

/** Regenerate (or create) the battlecard for a competitor. */
export async function updateBattlecardFor(competitorId: string): Promise<BattlecardWire> {
  const bc = await updateBattlecard(competitorId);
  await fetchBattlecardHistoryFor(competitorId);
  return bc;
}

/** React hook: subscribe to the store, returns current snapshot. */
export function useAseData(): AseData {
  return useSyncExternalStore(subscribe, getSnapshot);
}
