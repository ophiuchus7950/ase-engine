/**
 * Rivela ASE — alert rule evaluation at routing time (schema 002).
 *
 * Hooked into POST /signals/:id/route (the single choke point both the router
 * worker and manual API calls go through). For every enabled rule:
 *   1. MATCH   — triggers: min_score, categories, competitor_ids, keywords
 *                (keywords are matched case-insensitively against raw text).
 *   2. ROUTING — if the rule declares a routing_override, the signal's
 *                routing decision is escalated to it (that's what "rules
 *                affect routing" means in the single-user MVP).
 *   3. NOTIFY  — one in-app notification (bell) per rule, plus real delivery:
 *                webhook targets get an HTTP POST; email targets are recorded
 *                in the bell (no SMTP in the MVP).
 *
 * Delivery is best-effort: a failed webhook POST still leaves the in-app
 * notification with status 'failed' so the user can see it in the bell.
 */
import type { Repos } from '../../db/repo-types';
import type { AlertRule, SignalDetail } from '../../types/domain';

const WEBHOOK_TIMEOUT_MS = 5_000;

export interface RuleEvaluationResult {
  rule: AlertRule;
  matched: boolean;
  /** True when the rule escalated the signal's routing decision. */
  routingChanged: boolean;
}

function ruleMatches(rule: AlertRule, signal: SignalDetail): boolean {
  if (!rule.enabled) return false;
  const t = rule.triggers;
  if (t.minScore !== undefined && signal.significanceScore < t.minScore) return false;
  if (
    t.categories !== undefined &&
    t.categories.length > 0 &&
    !t.categories.includes(signal.actionType)
  ) {
    return false;
  }
  if (
    t.competitorIds !== undefined &&
    t.competitorIds.length > 0 &&
    !t.competitorIds.includes(signal.competitorId)
  ) {
    return false;
  }
  if (t.keywords !== undefined && t.keywords.length > 0) {
    const haystack = `${signal.rawText} ${signal.keyFacts.join(' ')}`.toLowerCase();
    const hit = t.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
    if (!hit) return false;
  }
  return true;
}

/**
 * Deliver a rule's channels. webhook targets get a real HTTP POST; email
 * targets are recorded in the bell (in-app) — no SMTP transport in the MVP.
 * Delivery is best-effort: failures are recorded on the notification, never
 * thrown.
 */
async function deliverChannels(repos: Repos, rule: AlertRule, signal: SignalDetail): Promise<void> {
  for (const channel of rule.channels) {
    // Webhook targets: real HTTP POST over the URL.
    if (channel.type === 'webhook' && /^https?:\/\//.test(channel.target)) {
      const status = await postWebhook(channel.target, {
        rule: rule.name,
        signal: {
          id: signal.id,
          competitor: signal.competitorName,
          action_type: signal.actionType,
          significance_score: signal.significanceScore,
          title: signal.keyFacts[0] ?? signal.rawText.slice(0, 120),
        },
      });
      await repos.notifications.create({
        organizationId: signal.organizationId,
        signalId: signal.id,
        ruleId: rule.id,
        title: `Alert: ${rule.name}`,
        body: `[${signal.competitorName}] ${signal.keyFacts[0] ?? signal.rawText.slice(0, 140)}`,
        channel: channel.type,
        status,
      });
      continue;
    }

    // Remaining (email and other non-URL targets): bell-only, no outbound
    // transport.
    await repos.notifications.create({
      organizationId: signal.organizationId,
      signalId: signal.id,
      ruleId: rule.id,
      title: `Alert: ${rule.name}`,
      body: `[${signal.competitorName}] ${signal.keyFacts[0] ?? signal.rawText.slice(0, 140)}`,
      channel: channel.type,
      status: 'delivered',
    });
  }
}

async function postWebhook(url: string, payload: unknown): Promise<'delivered' | 'failed'> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return res.ok ? 'delivered' : 'failed';
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return 'failed';
  }
}

/**
 * Evaluate all org rules against a routed signal. Called after the routing
 * outcome is stored. Applies routing overrides + fires notifications.
 */
export async function evaluateRules(
  repos: Repos,
  organizationId: string,
  signal: SignalDetail,
): Promise<RuleEvaluationResult[]> {
  const rules = await repos.alertRules.list(organizationId);
  const results: RuleEvaluationResult[] = [];
  // Local working copy — a rule's routing override updates the decision seen by
  // later rules and by delivery, without mutating the caller's signal.
  let working: SignalDetail = { ...signal };

  for (const rule of rules) {
    if (!ruleMatches(rule, working)) {
      results.push({ rule, matched: false, routingChanged: false });
      continue;
    }
    await repos.alertRules.incrementFired(rule.id);

    let routingChanged = false;
    if (rule.routingOverride !== null && rule.routingOverride !== working.routingDecision) {
      await repos.signals.updateRouting(
        working.id,
        {
          routingDecision: rule.routingOverride,
          battlecardUpdateTriggered:
            rule.routingOverride === 'signal_card' || working.battlecardUpdateTriggered,
          dealAlertCheckTriggered: working.dealAlertCheckTriggered,
        },
        new Date(),
      );
      routingChanged = true;
      working = { ...working, routingDecision: rule.routingOverride };
    }

    await deliverChannels(repos, rule, working);
    results.push({ rule, matched: true, routingChanged });
  }

  return results;
}
