/**
 * Rivela ASE web — backend wire DTO -> design view-model mappers.
 *
 * Converts SignalDetailWire (engine contract) into the Signal/Competitor/
 * ActivityPoint shapes the Figma design's views consume. Live data replaces
 * the mock data in the store; these mappers make it seamless.
 */

import type { ActivityPoint, Category, Competitor, CompetitorBar, Signal } from '../types/design';
import type { CompetitorProfileWire, SignalDetailWire } from './client';

const ACTION_TO_CATEGORY: Record<string, Category> = {
  pricing: 'Pricing',
  product: 'Product',
  personnel: 'Personnel',
  messaging: 'Messaging',
  partnership: 'Partnerships',
  funding: 'Funding',
  customer_win: 'Customer Wins',
  regulatory: 'Other',
  other: 'Other',
};

const SOURCE_TYPE_MAP: Record<string, Signal['sourceType']> = {
  competitor_website: 'web',
  news_rss: 'news',
  social_twitter: 'social',
  social_linkedin: 'social',
  social_reddit: 'social',
  g2: 'review',
  capterra: 'review',
  trustradius: 'review',
  job_board: 'job',
  gong_chorus: 'web',
  salesforce: 'web',
  hubspot: 'web',
  slack: 'web',
  sec_edgar: 'news',
  patents: 'news',
};

const CONFIDENCE_PCT: Record<'high' | 'medium' | 'low', number> = {
  high: 92,
  medium: 70,
  low: 45,
};

function summarize(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function deriveTitle(w: SignalDetailWire): string {
  if (w.key_facts.length > 0) return w.key_facts[0];
  return summarize(w.raw_text, 90);
}

function deriveActions(w: SignalDetailWire): string[] {
  const comp = w.competitor_name;
  switch (w.routing_decision) {
    case 'signal_card':
      return [
        `Update the ${comp} battlecard — this signal warrants immediate attention`,
        'Alert sales leadership: prep a counter-narrative for competitive deals',
        w.battlecard_update_triggered
          ? 'Battlecard update workflow triggered — assign owner and track completion'
          : 'Consider triggering a battlecard update for affected product lines',
        w.deal_alert_check_triggered
          ? 'Deal-alert check flagged — review open opportunities against this signal'
          : 'Monitor open deals for exposure to this development',
      ];
    case 'weekly_digest':
      return [
        `Add to this week's competitive digest under ${comp}`,
        'Track for follow-up developments over the next 14 days',
      ];
    default:
      return ['File to archive — low current impact, review if context changes'];
  }
}

function deriveTags(w: SignalDetailWire): string[] {
  const tags = [w.action_type, w.confidence_level, w.routing_decision];
  if (w.battlecard_update_triggered) tags.push('battlecard-update');
  if (w.deal_alert_check_triggered) tags.push('deal-alert');
  return tags;
}

/** Map a backend signal detail DTO onto the design's Signal view-model. */
export function mapSignal(w: SignalDetailWire): Signal {
  return {
    id: w.id,
    competitor: w.competitor_name,
    category: ACTION_TO_CATEGORY[w.action_type] ?? 'Other',
    title: deriveTitle(w),
    summary: summarize(w.raw_text, 220),
    significance: w.significance_score,
    confidence: CONFIDENCE_PCT[w.confidence_level] ?? 50,
    source: w.source_url ?? w.source_type,
    sourceType: SOURCE_TYPE_MAP[w.source_type] ?? 'web',
    detectedAt: w.collected_at ?? w.created_at,
    aiInterpretation: summarize(w.raw_text, 600),
    rawExcerpt: summarize(w.raw_text, 400),
    recommendedActions: deriveActions(w),
    tags: deriveTags(w),
    isBookmarked: w.bookmarked,
    isRead: w.routed_at !== null,
    routingDecision: w.routing_decision,
  };
}

const PALETTE = [
  '#FF5C00',
  '#4F46E5',
  '#00B4D8',
  '#7C3AED',
  '#059669',
  '#DC2626',
  '#F59E0B',
  '#0FCCB8',
];

function logoOf(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/** Derive competitor profiles from the signal set (design Competitor shape). */
export function deriveCompetitors(signals: Signal[]): Competitor[] {
  const byName = new Map<string, Signal[]>();
  signals.forEach((s) => {
    const list = byName.get(s.competitor) ?? [];
    list.push(s);
    byName.set(s.competitor, list);
  });
  return [...byName.entries()]
    .map(([name, sigs], i) => {
      const sorted = [...sigs].sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt));
      const latest = sorted[0];
      return {
        id: `live-${i}`,
        name,
        logo: logoOf(name),
        logoColor: PALETTE[i % PALETTE.length],
        website: latest.source,
        lastSignal: 'live',
        signalCount: sigs.length,
        signalTrend: 'up' as const,
        trendPercent: sigs.length > 1 ? 100 : 0,
        monitoringActive: true,
        tags: [...new Set(sigs.slice(0, 6).map((s) => s.category))],
      };
    })
    .sort((a, b) => b.signalCount - a.signalCount);
}

/** Build the 7-day signal velocity series (design ActivityPoint shape). */
export function deriveActivity(signals: Signal[]): ActivityPoint[] {
  const now = new Date();
  const offsets = [6, 5, 4, 3, 2, 1, 0];
  return offsets.map((offset) => {
    const d = new Date(now);
    d.setDate(now.getDate() - offset);
    const key = d.toDateString();
    const daySignals = signals.filter((s) => new Date(s.detectedAt).toDateString() === key);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      signals: daySignals.length,
      high: daySignals.filter((s) => s.significance >= 7).length,
    };
  });
}

/** Competitor bar chart series from live competitors. */
export function deriveCompetitorBars(competitors: Competitor[]): CompetitorBar[] {
  return competitors.slice(0, 6).map((c) => ({
    name: c.name,
    signals: c.signalCount,
    color: c.logoColor,
  }));
}

/** Compact relative-time label (e.g. "3h ago") for the feed/competitor rows. */
function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Map a live competitor profile (schema 002 /v1/competitors) onto the design
 * Competitor view-model. The palette index keeps logo colors stable per list
 * position, mirroring how deriveCompetitors() colors derived profiles.
 */
export function profileToCompetitor(wire: CompetitorProfileWire, index = 0): Competitor {
  return {
    id: wire.id,
    name: wire.name,
    logo: logoOf(wire.name),
    logoColor: PALETTE[index % PALETTE.length],
    website: wire.sources[0]?.target_url ?? '',
    lastSignal: timeAgo(wire.created_at),
    signalCount: wire.signal_count,
    signalTrend: 'up' as const,
    trendPercent: 0,
    monitoringActive: wire.monitoring_active ?? true,
    tags: [...new Set(wire.sources.map((s) => s.source_type))],
  };
}
