import { describe, expect, it } from 'vitest';

import type { SourceType } from '../../types/domain';
import { ACTION_TYPES, SOURCE_TYPES } from '../../types/domain';
import {
  RECENCY_WINDOW_MS,
  SOURCE_AUTHORITY,
  computeFactorScores,
  computeRecencyScore,
  computeSignificanceScore,
  type ScorerInput,
} from './scorer';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

function baseInput(overrides: Partial<ScorerInput> = {}): ScorerInput {
  return {
    collectedAt: new Date(NOW.getTime() - 47 * HOUR_MS),
    now: NOW,
    sourceType: 'competitor_website',
    actionType: 'other',
    icpMatch: false,
    activeDealCompetitor: false,
    isNovel: false,
    isRepeat: false,
    ...overrides,
  };
}

describe('computeRecencyScore', () => {
  it('awards +2 for signals under 48h old (47h boundary)', () => {
    expect(computeRecencyScore(new Date(NOW.getTime() - 47 * HOUR_MS), NOW)).toBe(2);
  });

  it('awards 0 for signals 48h or older (49h boundary)', () => {
    expect(computeRecencyScore(new Date(NOW.getTime() - 49 * HOUR_MS), NOW)).toBe(0);
  });

  it('awards 0 at exactly 48h (rule is strictly < 48h)', () => {
    expect(computeRecencyScore(new Date(NOW.getTime() - RECENCY_WINDOW_MS), NOW)).toBe(0);
  });
});

describe('computeFactorScores — source authority', () => {
  const PRIMARY: SourceType[] = [
    'competitor_website',
    'sec_edgar',
    'patents',
    'gong_chorus',
    'salesforce',
    'hubspot',
  ];
  const SECONDARY: SourceType[] = [
    'g2',
    'capterra',
    'trustradius',
    'job_board',
    'news_rss',
    'slack',
  ];
  const SOCIAL: SourceType[] = ['social_twitter', 'social_linkedin', 'social_reddit'];

  it('covers every source type in the domain contract', () => {
    expect(Object.keys(SOURCE_AUTHORITY).sort()).toEqual([...SOURCE_TYPES].sort());
  });

  it.each(PRIMARY)('awards +2 for primary source %s', (sourceType) => {
    expect(computeFactorScores(baseInput({ sourceType })).scoreSourceAuthority).toBe(2);
  });

  it.each(SECONDARY)('awards +1 for secondary source %s', (sourceType) => {
    expect(computeFactorScores(baseInput({ sourceType })).scoreSourceAuthority).toBe(1);
  });

  it.each(SOCIAL)('awards 0 for social source %s', (sourceType) => {
    expect(computeFactorScores(baseInput({ sourceType })).scoreSourceAuthority).toBe(0);
  });
});

describe('computeFactorScores — action type', () => {
  it.each([
    ['pricing', 3],
    ['product', 2],
    ['personnel', 1],
    ['messaging', 0],
    ['partnership', 0],
    ['funding', 0],
    ['customer_win', 0],
    ['regulatory', 0],
    ['other', 0],
  ] as const)('awards %i for action type %s', (actionType, expected) => {
    expect(computeFactorScores(baseInput({ actionType })).scoreActionType).toBe(expected);
  });

  it('covers every action type in the domain contract', () => {
    const covered = [
      'pricing',
      'product',
      'personnel',
      'messaging',
      'partnership',
      'funding',
      'customer_win',
      'regulatory',
      'other',
    ];
    expect([...ACTION_TYPES].sort()).toEqual([...covered].sort());
  });
});

describe('computeFactorScores — icp / deal stage / novelty', () => {
  it('awards +2 when the signal matches the tracked ICP, else 0', () => {
    expect(computeFactorScores(baseInput({ icpMatch: true })).scoreIcpRelevance).toBe(2);
    expect(computeFactorScores(baseInput({ icpMatch: false })).scoreIcpRelevance).toBe(0);
  });

  it('awards +2 when the competitor is in an active deal, else 0', () => {
    expect(
      computeFactorScores(baseInput({ activeDealCompetitor: true })).scoreDealStageContext,
    ).toBe(2);
    expect(
      computeFactorScores(baseInput({ activeDealCompetitor: false })).scoreDealStageContext,
    ).toBe(0);
  });

  it('awards +1 for a novel signal, -1 for a repeat, 0 when unknown', () => {
    expect(computeFactorScores(baseInput({ isNovel: true, isRepeat: false })).scoreNovelty).toBe(1);
    expect(computeFactorScores(baseInput({ isNovel: false, isRepeat: true })).scoreNovelty).toBe(
      -1,
    );
    expect(computeFactorScores(baseInput({ isNovel: false, isRepeat: false })).scoreNovelty).toBe(
      0,
    );
  });
});

describe('computeSignificanceScore', () => {
  it('clamps a zero sum up to 1', () => {
    expect(
      computeSignificanceScore({
        scoreRecency: 0,
        scoreSourceAuthority: 0,
        scoreActionType: 0,
        scoreIcpRelevance: 0,
        scoreDealStageContext: 0,
        scoreNovelty: 0,
      }),
    ).toBe(1);
  });

  it('clamps a negative sum (repeat + low-value signal) up to 1', () => {
    expect(
      computeSignificanceScore({
        scoreRecency: 0,
        scoreSourceAuthority: 0,
        scoreActionType: 0,
        scoreIcpRelevance: 0,
        scoreDealStageContext: 0,
        scoreNovelty: -1,
      }),
    ).toBe(1);
  });

  it('clamps a maximal sum down to 10', () => {
    expect(
      computeSignificanceScore({
        scoreRecency: 2,
        scoreSourceAuthority: 2,
        scoreActionType: 3,
        scoreIcpRelevance: 2,
        scoreDealStageContext: 2,
        scoreNovelty: 1,
      }),
    ).toBe(10);
  });

  it('keeps mid-range sums unchanged', () => {
    expect(
      computeSignificanceScore({
        scoreRecency: 2,
        scoreSourceAuthority: 1,
        scoreActionType: 2,
        scoreIcpRelevance: 2,
        scoreDealStageContext: 0,
        scoreNovelty: 0,
      }),
    ).toBe(7);
  });
});
