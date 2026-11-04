/**
 * Rivela ASE — pure Block Kit builder tests (Workstream B).
 *
 * These builders make no network calls, so they are fully unit-testable without
 * a live Slack workspace.
 */
import { describe, expect, it } from 'vitest';
import type { SignalDetail } from '../types/domain';
import {
  ACTION_MUTE_RULE,
  ACTION_OPEN_SIGNAL,
  ACTION_VIEW_BATTLECARD,
  buildHelpBlocks,
  buildSignalCardBlocks,
  buildSignalsSummaryBlocks,
  buildStatusBlocks,
  parseActionId,
} from './slack-blocks';

const WEB_APP_URL = 'http://localhost:5173';

function makeSignal(overrides: Partial<SignalDetail> = {}): SignalDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    rawSignalId: '22222222-2222-4222-8222-222222222222',
    organizationId: '33333333-3333-4333-8333-333333333333',
    competitorId: '44444444-4444-4444-8444-444444444444',
    actionType: 'pricing',
    confidenceLevel: 'high',
    keyFacts: ['Enterprise plan now $99 per user', 'Annual billing discount removed'],
    llmModelUsed: 'test-model',
    classifiedAt: '2026-07-30T10:00:00.000Z',
    scoreRecency: 5,
    scoreSourceAuthority: 5,
    scoreActionType: 5,
    scoreIcpRelevance: 5,
    scoreDealStageContext: 5,
    scoreNovelty: 5,
    significanceScore: 9,
    scoredAt: '2026-07-30T11:00:00.000Z',
    routingDecision: 'signal_card',
    battlecardUpdateTriggered: true,
    dealAlertCheckTriggered: true,
    routedAt: '2026-07-30T12:00:00.000Z',
    bookmarked: false,
    createdAt: '2026-07-30T10:00:00.000Z',
    rawText: 'Globex raised prices on the Enterprise plan.',
    sourceType: 'competitor_website',
    sourceUrl: 'https://globex.example.com/pricing',
    collectedAt: '2026-07-30T09:00:00.000Z',
    competitorName: 'Globex',
    ...overrides,
  };
}

function flattenedText(blocks: unknown[]): string {
  return JSON.stringify(blocks);
}

describe('buildSignalCardBlocks', () => {
  it('contains the competitor, action type, score and confidence', () => {
    const blocks = buildSignalCardBlocks(makeSignal(), WEB_APP_URL);
    const text = flattenedText(blocks);
    expect(text).toContain('Globex');
    expect(text).toContain('pricing');
    expect(text).toContain('9/10');
    expect(text).toContain('high');
  });

  it('lists the key facts', () => {
    const blocks = buildSignalCardBlocks(makeSignal(), WEB_APP_URL);
    const text = flattenedText(blocks);
    expect(text).toContain('Enterprise plan now $99 per user');
    expect(text).toContain('Annual billing discount removed');
  });

  it('renders Open signal + View battlecard link buttons pointing at the web app', () => {
    const blocks = buildSignalCardBlocks(makeSignal(), WEB_APP_URL);
    const text = flattenedText(blocks);
    expect(text).toContain(`${WEB_APP_URL}/signals/11111111-1111-4111-8111-111111111111`);
    expect(text).toContain(`${WEB_APP_URL}/competitors/44444444-4444-4444-8444-444444444444`);
    expect(text).toContain('Open signal');
    expect(text).toContain('View battlecard');
  });

  it('adds a Mute rule button when a ruleId is provided', () => {
    const blocks = buildSignalCardBlocks(
      makeSignal(),
      WEB_APP_URL,
      '55555555-5555-4555-8555-555555555555',
    );
    const text = flattenedText(blocks);
    expect(text).toContain(`${ACTION_MUTE_RULE}:55555555-5555-4555-8555-555555555555`);
  });

  it('omits the Mute rule button without a ruleId', () => {
    const blocks = buildSignalCardBlocks(makeSignal(), WEB_APP_URL);
    expect(flattenedText(blocks)).not.toContain(ACTION_MUTE_RULE);
  });
});

describe('buildHelpBlocks', () => {
  it('returns a help card mentioning /ase commands', () => {
    const blocks = buildHelpBlocks();
    const text = flattenedText(blocks);
    expect(blocks.length).toBeGreaterThan(0);
    expect(text).toContain('/ase status');
    expect(text).toContain('/ase signals');
  });
});

describe('buildStatusBlocks', () => {
  it('renders key/value fields from the result record', () => {
    const blocks = buildStatusBlocks({ status: 'ok', competitors: 3, unread: 2 });
    const text = flattenedText(blocks);
    expect(blocks.length).toBeGreaterThan(0);
    expect(text).toContain('status:');
    expect(text).toContain('ok');
    expect(text).toContain('competitors:');
    expect(text).toContain('3');
  });
});

describe('buildSignalsSummaryBlocks', () => {
  it('renders one line per item with score and link', () => {
    const blocks = buildSignalsSummaryBlocks(
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          title: 'Price hike',
          score: 8,
          competitor: 'Globex',
        },
      ],
      WEB_APP_URL,
    );
    const text = flattenedText(blocks);
    expect(text).toContain('Price hike');
    expect(text).toContain('8/10');
    expect(text).toContain(`${WEB_APP_URL}/signals/11111111-1111-4111-8111-111111111111`);
  });

  it('returns an empty-state block when there are no items', () => {
    const blocks = buildSignalsSummaryBlocks([], WEB_APP_URL);
    expect(flattenedText(blocks)).toContain('No signals found');
  });
});

describe('parseActionId', () => {
  it('parses open_signal with the signal id', () => {
    expect(parseActionId(`${ACTION_OPEN_SIGNAL}:abc-123`)).toEqual({
      kind: 'open_signal',
      signalId: 'abc-123',
    });
  });

  it('parses view_battlecard with the competitor id', () => {
    expect(parseActionId(`${ACTION_VIEW_BATTLECARD}:cmp-1`)).toEqual({
      kind: 'view_battlecard',
      competitorId: 'cmp-1',
    });
  });

  it('parses mute_rule with the rule id', () => {
    expect(parseActionId(`${ACTION_MUTE_RULE}:rule-1`)).toEqual({
      kind: 'mute_rule',
      ruleId: 'rule-1',
    });
  });

  it('ignores unknown action ids', () => {
    expect(parseActionId('unknown:123')).toEqual({ kind: 'unknown' });
    expect(parseActionId('no-colon')).toEqual({ kind: 'unknown' });
    expect(parseActionId('mute_rule:')).toEqual({ kind: 'unknown' });
  });
});
