/**
 * Rivela ASE — deterministic battlecard document builder (schema 002/003).
 *
 * Shared by the GET-on-first-access route, manual update, the routing-time
 * trigger, and the reconciliation worker. Pure "compute": no I/O, unit-tested.
 * The battlecard is derived from the competitor's signal_card-routed signals:
 * summary + per-category sections with key-fact bullets + source links. No LLM
 * call — instant, honest, and testable.
 */
import type { BattlecardContent, SignalDetail } from '../types/domain';

export function buildBattlecardContent(
  competitorName: string,
  signals: SignalDetail[],
): BattlecardContent {
  const byCategory = new Map<string, SignalDetail[]>();
  for (const signal of signals) {
    const list = byCategory.get(signal.actionType) ?? [];
    list.push(signal);
    byCategory.set(signal.actionType, list);
  }

  const sections = Array.from(byCategory.entries()).map(([category, items]) => ({
    heading: category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    bullets: items
      .slice(0, 5)
      .map(
        (s) =>
          `${s.keyFacts[0] ?? s.rawText.slice(0, 140)}${s.sourceUrl ? ` (${s.sourceUrl})` : ''}`,
      ),
  }));

  return {
    competitorName,
    summary:
      signals.length === 0
        ? `No high-priority signals for ${competitorName} yet — battlecard will populate when signals arrive.`
        : `${signals.length} high-priority signal${signals.length === 1 ? '' : 's'} for ${competitorName} across ${sections.length} categor${sections.length === 1 ? 'y' : 'ies'}.`,
    sections,
    sourceSignals: signals.slice(0, 10).map((s) => ({
      id: s.id,
      title: s.keyFacts[0] ?? s.rawText.slice(0, 120),
      score: s.significanceScore,
      sourceUrl: s.sourceUrl,
    })),
  };
}
