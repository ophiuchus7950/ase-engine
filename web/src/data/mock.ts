/**
 * Rivela ASE web — demo data slices.
 *
 * The UI boots with empty data and swaps in live engine data as soon as the
 * API responds (see data/ase-store.ts). Every view has an empty state, so a
 * fresh install starts clean — add a competitor to begin monitoring.
 */

import type { ActivityPoint, Competitor, CompetitorBar, Signal } from '../types/design';
import type { AlertRuleWire, NotificationWire } from '../api/client';

export const COMPETITORS: Competitor[] = [];

export const SIGNALS: Signal[] = [];

/** Last 7 days, all zeros — replaced by deriveActivity() once live data flows. */
export const ACTIVITY_DATA: ActivityPoint[] = [];

export const COMPETITOR_BARS: CompetitorBar[] = [];

export const ALERT_RULES: AlertRuleWire[] = [];

export const NOTIFICATIONS: NotificationWire[] = [];

/** Bell badge seed — derived from the (empty) inbox so the two always agree. */
export const UNREAD_COUNT: number = NOTIFICATIONS.filter((n) => n.read_at === null).length;
