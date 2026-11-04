import { describe, expect, it } from 'vitest';

import { decideRouting } from './router';

describe('decideRouting — significance boundaries (spec §3)', () => {
  it.each([
    [10, 'signal_card'],
    [7, 'signal_card'],
    [6, 'weekly_digest'],
    [4, 'weekly_digest'],
    [3, 'archive'],
    [0, 'archive'],
  ] as const)('score %i routes to %s', (significanceScore, expected) => {
    expect(decideRouting(significanceScore).routingDecision).toBe(expected);
  });

  it('treats fractional scores consistently (3.9 -> archive, 4.0 -> weekly_digest)', () => {
    expect(decideRouting(3.9).routingDecision).toBe('archive');
    expect(decideRouting(4.0).routingDecision).toBe('weekly_digest');
  });
});

describe('decideRouting — battlecard flag', () => {
  it('triggers a battlecard update only on signal_card', () => {
    expect(decideRouting(7).battlecardUpdateTriggered).toBe(true);
    expect(decideRouting(4).battlecardUpdateTriggered).toBe(false);
    expect(decideRouting(3).battlecardUpdateTriggered).toBe(false);
  });
});

describe('decideRouting — deal alert flag (MVP heuristic)', () => {
  it.each(['pricing', 'product', 'customer_win'] as const)(
    'triggers a deal-alert check for signal_card + %s',
    (actionType) => {
      const route = decideRouting(7, actionType);
      expect(route.dealAlertCheckTriggered).toBe(true);
      expect(route.battlecardUpdateTriggered).toBe(true);
    },
  );

  it('does not trigger a deal-alert check for non-deal action types on signal_card', () => {
    expect(decideRouting(7, 'personnel').dealAlertCheckTriggered).toBe(false);
    expect(decideRouting(7, 'funding').dealAlertCheckTriggered).toBe(false);
    expect(decideRouting(7, 'other').dealAlertCheckTriggered).toBe(false);
  });

  it('never triggers a deal-alert check below signal_card, even for deal action types', () => {
    expect(decideRouting(4, 'pricing').dealAlertCheckTriggered).toBe(false);
    expect(decideRouting(3, 'customer_win').dealAlertCheckTriggered).toBe(false);
  });

  it('does not trigger a deal-alert check when actionType is unknown', () => {
    expect(decideRouting(7).dealAlertCheckTriggered).toBe(false);
  });
});
