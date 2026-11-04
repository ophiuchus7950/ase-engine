/**
 * Rivela ASE web — design view-model types (from the Figma export).
 *
 * These are the UI-facing shapes the design's views consume. The live-data
 * store maps backend wire DTOs into these shapes (see api/mappers.ts).
 * Schema 002 slices (alert rules, notifications, session) are surfaced as
 * their wire types so the views render them with zero transformation.
 */

import type {
  AlertRuleChannelWire,
  AlertRuleWire,
  NotificationWire,
  SessionState,
  UserWire,
} from '../api/client';

export type Category =
  | 'Pricing'
  | 'Product'
  | 'Messaging'
  | 'Personnel'
  | 'Partnerships'
  | 'Funding'
  | 'Customer Wins'
  | 'Other';

export type Priority = 'high' | 'medium' | 'low';

export type View =
  | 'dashboard'
  | 'feed'
  | 'competitors'
  | 'timeline'
  | 'digest'
  | 'alerts'
  | 'monitoring'
  | 'activity';

/** What kicked off a battlecard regeneration (battlecard-history slice). */
export type BattlecardTrigger = 'routing' | 'worker' | 'manual' | 'startup';

/** One row of a competitor's battlecard version history (Activity feed). */
export interface BattlecardVersionRow {
  id: string;
  trigger: BattlecardTrigger;
  generatedAt: string;
  sourceSignalCount: number;
  summary: string;
  sections: { heading: string; bullets: string[] }[];
  sourceSignals: { id: string; title: string; score: number; sourceUrl: string | null }[];
}

/**
 * Delivery-log view for a NotificationWire. The store keeps notifications as
 * their wire shape (schema 002); this is the UI-facing extension for the
 * Slack/email/webhook delivery ledger surfaced in the Activity feed.
 */
export interface NotificationLogRow {
  channel: string;
  status: 'delivered' | 'failed' | 'pending';
  channelTarget?: string | null;
  slackTs?: string | null;
  permalink?: string | null;
  deliveredAt?: string | null;
  error?: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface Signal {
  id: string;
  competitor: string;
  category: Category;
  title: string;
  summary: string;
  significance: number; // 1-10
  confidence: number; // 0-100
  source: string;
  sourceType: 'web' | 'news' | 'social' | 'review' | 'job' | 'rss';
  detectedAt: string;
  aiInterpretation: string;
  rawExcerpt: string;
  recommendedActions: string[];
  tags: string[];
  isBookmarked: boolean;
  isRead: boolean;
  routingDecision?: 'signal_card' | 'weekly_digest' | 'archive';
}

export interface Competitor {
  id: string;
  name: string;
  logo: string;
  logoColor: string;
  website: string;
  lastSignal: string;
  signalCount: number;
  signalTrend: 'up' | 'down';
  trendPercent: number;
  monitoringActive: boolean;
  tags: string[];
}

export interface ActivityPoint {
  date: string;
  signals: number;
  high: number;
}

export interface CompetitorBar {
  name: string;
  signals: number;
  color: string;
}

/** Draft payload for creating/updating an alert rule (UI form shape). */
export interface RuleDraft {
  name: string;
  description?: string;
  enabled?: boolean;
  /** Route signals at or above this significance score (1-10). */
  minScore?: number;
  /** Route signals with these action types (e.g. 'pricing'). */
  categories?: string[];
  /** Route signals mentioning these competitor ids. */
  competitorIds?: string[];
  /** Route signals whose text matches any of these keywords. */
  keywords?: string[];
  channels?: AlertRuleChannelWire[];
  routingOverride?: 'signal_card' | 'weekly_digest' | 'archive' | null;
}

export interface AseData {
  signals: Signal[];
  /** Accumulated cursor-paginated signal slice for the Activity feed. Every
   * generated signal is reachable by appending pages via loadMoreSignals(). */
  activitySignals: Signal[];
  /** Cursor for the next page of the Activity feed (null when exhausted). */
  signalsCursor: string | null;
  /** True when more Activity-feed pages can still be loaded. */
  hasMore: boolean;
  /** Per-competitor battlecard version history (Activity feed). */
  battlecardHistory: Record<string, BattlecardVersionRow[]>;
  competitors: Competitor[];
  activity: ActivityPoint[];
  competitorBars: CompetitorBar[];
  /** Live alert rules (schema 002) — mock until refresh() swaps them in. */
  rules: AlertRuleWire[];
  /** Bell inbox (schema 002). */
  notifications: NotificationWire[];
  /** Unread notification count for the bell badge. */
  unreadCount: number;
  /** Authenticated user (sidebar identity) — null when logged out. */
  user: UserWire | null;
  /** Raw session (Bearer token + user) — null when logged out. */
  session: SessionState | null;
  /** true once live engine data has been loaded (mock data shown until then) */
  live: boolean;
  loading: boolean;
  lastSync: string | null;
}
