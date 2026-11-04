/**
 * Rivela ASE — unit tests for the deterministic battlecard builder
 * (src/battlecard/build.ts). Pure compute: same inputs, same output; no DB.
 */
import { describe, expect, it } from 'vitest';
import type { SignalDetail } from '../types/domain';
import { buildBattlecardContent } from './build';

function makeSignal(overrides: Partial<SignalDetail> = {}): SignalDetail {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    rawSignalId: '22222222-2222-2222-2222-222222222222',
    organizationId: '33333333-3333-3333-3333-333333333333',
    competitorId: '44444444-4444-4444-4444-444444444444',
    actionType: 'pricing',
    confidenceLevel: 'high',
    keyFacts: ['Enterprise plan now $99 per user per month'],
    llmModelUsed: 'test-model',
    classifiedAt: '2026-07-30T10:00:00.000Z',
    scoreRecency: 5,
    scoreSourceAuthority: 5,
    scoreActionType: 5,
    scoreIcpRelevance: 5,
    scoreDealStageContext: 5,
    scoreNovelty: 5,
    significanceScore: 10,
    scoredAt: '2026-07-30T10:00:00.000Z',
    routingDecision: 'signal_card',
    battlecardUpdateTriggered: true,
    dealAlertCheckTriggered: false,
    routedAt: '2026-07-30T10:00:00.000Z',
    bookmarked: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    rawText: 'Acme raised prices on the pro plan by 15%',
    sourceType: 'competitor_website',
    sourceUrl: null,
    collectedAt: '2026-07-30T09:59:00.000Z',
    competitorName: 'Acme',
    ...overrides,
  };
}

describe('buildBattlecardContent', () => {
  it('groups signals by action type with title-cased headings', () => {
    const signals = [
      makeSignal({ id: 'aaaa', actionType: 'pricing', keyFacts: ['Prices up 15%'] }),
      makeSignal({ id: 'bbbb', actionType: 'pricing', keyFacts: ['New tier added'] }),
      makeSignal({ id: 'cccc', actionType: 'product', keyFacts: ['Launched a new feature'] }),
    ];
    const content = buildBattlecardContent('Acme', signals);

    expect(content.competitorName).toBe('Acme');
    expect(content.sections.map((s) => s.heading)).toEqual(['Pricing', 'Product']);
    expect(content.sections[0]!.bullets).toEqual(['Prices up 15%', 'New tier added']);
    expect(content.sourceSignals).toHaveLength(3);
    expect(content.sourceSignals[0]!.id).toBe('aaaa');
    expect(content.sourceSignals[0]!.score).toBe(10);
  });

  it('embeds the source URL in a bullet when present', () => {
    const signals = [
      makeSignal({ keyFacts: ['Prices up 15%'], sourceUrl: 'https://acme.example.com/pricing' }),
    ];
    const content = buildBattlecardContent('Acme', signals);
    expect(content.sections[0]!.bullets[0]).toContain('https://acme.example.com/pricing');
  });

  it('falls back to raw text when a signal has no key facts', () => {
    const signals = [makeSignal({ keyFacts: [], rawText: 'Raw textual headline for Acme' })];
    const content = buildBattlecardContent('Acme', signals);
    expect(content.sections[0]!.bullets[0]).toContain('Raw textual headline for Acme');
  });

  it('produces a friendly empty summary when there are no signals', () => {
    const content = buildBattlecardContent('Acme', []);
    expect(content.summary).toContain('No high-priority signals for Acme');
    expect(content.sections).toHaveLength(0);
    expect(content.sourceSignals).toHaveLength(0);
  });

  it('summarizes the count of signals across distinct categories', () => {
    const signals = [makeSignal({ actionType: 'pricing' }), makeSignal({ actionType: 'product' })];
    const content = buildBattlecardContent('Acme', signals);
    expect(content.summary).toContain('2 high-priority signals for Acme across 2 categories');
  });
});
