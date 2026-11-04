import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ClassifyRequest, IngestRawSignalRequest, ScoreRequest } from '../types/domain';
import type { Repos } from './repo-types';
import { RepoError } from './repos';
import {
  applyTestSchema,
  classifyRequest,
  createTestPool,
  createTestRepos,
  ensureTestDatabase,
  ingestRequest,
  insertCompetitor,
  insertOrganization,
  resetTestDb,
} from './test-db';

const LOW_SCORES: ScoreRequest = {
  scoreRecency: 0,
  scoreSourceAuthority: 0,
  scoreActionType: 0,
  scoreIcpRelevance: 0,
  scoreDealStageContext: 0,
  scoreNovelty: 0,
};

describe('SignalRepo', () => {
  let pool: Pool;
  let repos: Repos;
  let organizationId: string;
  let competitorId: string;

  beforeAll(async () => {
    await ensureTestDatabase();
    pool = await createTestPool();
    await applyTestSchema(pool);
    repos = createTestRepos(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetTestDb(pool);
    organizationId = await insertOrganization(pool);
    competitorId = await insertCompetitor(pool, organizationId, 'Globex');
  });

  async function createRaw(
    overrides: Partial<IngestRawSignalRequest> = {},
  ): Promise<{ id: string; rawText: string; collectedAt: string }> {
    const { signal } = await repos.rawSignals.ingest(
      ingestRequest(organizationId, competitorId, overrides),
    );
    return { id: signal.id, rawText: signal.rawText, collectedAt: signal.collectedAt };
  }

  async function classifySignal(
    reqOverrides: Partial<ClassifyRequest> = {},
    rawOverrides: Partial<IngestRawSignalRequest> = {},
  ): Promise<{ rawId: string; signalId: string; rawText: string }> {
    const raw = await createRaw(rawOverrides);
    const signal = await repos.signals.createFromClassification(
      raw.id,
      organizationId,
      competitorId,
      classifyRequest(reqOverrides),
      new Date(),
    );
    return { rawId: raw.id, signalId: signal.id, rawText: raw.rawText };
  }

  it('createFromClassification stores classification output with placeholder score/route', async () => {
    const raw = await createRaw();
    const now = new Date('2026-07-31T12:00:00.000Z');
    const signal = await repos.signals.createFromClassification(
      raw.id,
      organizationId,
      competitorId,
      classifyRequest(),
      now,
    );

    expect(signal.id).toBeTypeOf('string');
    expect(signal.rawSignalId).toBe(raw.id);
    expect(signal.organizationId).toBe(organizationId);
    expect(signal.competitorId).toBe(competitorId);
    expect(signal.actionType).toBe('pricing');
    expect(signal.confidenceLevel).toBe('high');
    expect(signal.keyFacts).toEqual([
      'Enterprise plan now $99 per user per month, up from $79',
      'Annual billing discount removed',
    ]);
    expect(signal.llmModelUsed).toBe('openrouter/mistralai/mistral-7b-instruct:free');
    expect(signal.classifiedAt).toBe(now.toISOString());
    // Placeholders until updateScore/updateRouting run (schema NOT NULL quirk):
    expect(signal.significanceScore).toBe(1);
    expect(signal.routingDecision).toBe('archive');
    expect(signal.scoredAt).toBeNull();
    expect(signal.routedAt).toBeNull();
    expect(signal.battlecardUpdateTriggered).toBe(false);
    expect(signal.dealAlertCheckTriggered).toBe(false);
    expect(signal.scoreRecency).toBe(0);
    expect(signal.scoreNovelty).toBe(0);
  });

  it('createFromClassification rejects a second classification of the same raw signal', async () => {
    const { signalId } = await classifySignal();
    const second = repos.signals.createFromClassification(
      signalId,
      organizationId,
      competitorId,
      classifyRequest(),
      new Date(),
    );
    await expect(second).rejects.toBeInstanceOf(RepoError);
  });

  it('updateScore computes significance as the sum of the six factors, clamped to 1..10', async () => {
    const { signalId } = await classifySignal();

    // sum 12 → clamped to 10
    const high = await repos.signals.updateScore(
      signalId,
      {
        scoreRecency: 2,
        scoreSourceAuthority: 2,
        scoreActionType: 3,
        scoreIcpRelevance: 2,
        scoreDealStageContext: 2,
        scoreNovelty: 1,
      },
      new Date('2026-07-31T13:00:00.000Z'),
    );
    expect(high?.significanceScore).toBe(10);
    expect(high?.scoreRecency).toBe(2);
    expect(high?.scoreActionType).toBe(3);
    expect(high?.scoredAt).toBe('2026-07-31T13:00:00.000Z');

    // sum -1 (negative novelty) → clamped to 1
    const low = await repos.signals.updateScore(
      signalId,
      { ...LOW_SCORES, scoreNovelty: -1 },
      new Date(),
    );
    expect(low?.significanceScore).toBe(1);

    // sum 6 → unclamped
    const mid = await repos.signals.updateScore(
      signalId,
      {
        scoreRecency: 1,
        scoreSourceAuthority: 1,
        scoreActionType: 1,
        scoreIcpRelevance: 1,
        scoreDealStageContext: 1,
        scoreNovelty: 1,
      },
      new Date(),
    );
    expect(mid?.significanceScore).toBe(6);

    expect(
      await repos.signals.updateScore(
        '00000000-0000-0000-0000-000000000000',
        LOW_SCORES,
        new Date(),
      ),
    ).toBeNull();
  });

  it('updateRouting stores the routing outcome and routed_at', async () => {
    const { signalId } = await classifySignal();
    await repos.signals.updateScore(signalId, LOW_SCORES, new Date());

    const routed = await repos.signals.updateRouting(
      signalId,
      {
        routingDecision: 'signal_card',
        battlecardUpdateTriggered: true,
        dealAlertCheckTriggered: false,
      },
      new Date('2026-07-31T14:00:00.000Z'),
    );
    expect(routed?.routingDecision).toBe('signal_card');
    expect(routed?.battlecardUpdateTriggered).toBe(true);
    expect(routed?.dealAlertCheckTriggered).toBe(false);
    expect(routed?.routedAt).toBe('2026-07-31T14:00:00.000Z');
    expect(routed?.significanceScore).toBe(1);
  });

  it('getById returns the joined SignalDetail (raw text, source metadata, competitor name)', async () => {
    const { signalId, rawText } = await classifySignal(
      {},
      {
        sourceType: 'g2',
        sourceUrl: 'https://www.g2.com/products/globex/reviews/12345',
        contentHash: 'hash-g2',
      },
    );

    const detail = await repos.signals.getById(signalId);
    expect(detail?.rawText).toBe(rawText);
    expect(detail?.sourceType).toBe('g2');
    expect(detail?.sourceUrl).toBe('https://www.g2.com/products/globex/reviews/12345');
    expect(detail?.collectedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(detail?.competitorName).toBe('Globex');
    expect(detail?.actionType).toBe('pricing');
    expect(detail?.keyFacts).toHaveLength(2);

    expect(await repos.signals.getById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('list filters by decision/action/significance and paginates', async () => {
    const s1 = await classifySignal({}, { contentHash: 'hash-1' });
    const s2 = await classifySignal({ actionType: 'product' }, { contentHash: 'hash-2' });
    const s3 = await classifySignal({}, { contentHash: 'hash-3' });

    await repos.signals.updateScore(
      s1.signalId,
      {
        ...LOW_SCORES,
        scoreActionType: 3,
        scoreSourceAuthority: 2,
        scoreIcpRelevance: 2,
        scoreNovelty: 1,
        scoreRecency: 2,
        scoreDealStageContext: 0,
      },
      new Date(),
    ); // sum 10
    await repos.signals.updateScore(s2.signalId, LOW_SCORES, new Date()); // sum 0 → 1
    await repos.signals.updateScore(
      s3.signalId,
      {
        ...LOW_SCORES,
        scoreActionType: 3,
        scoreSourceAuthority: 2,
        scoreIcpRelevance: 2,
        scoreNovelty: 1,
        scoreRecency: 2,
        scoreDealStageContext: 0,
      },
      new Date(),
    ); // sum 10
    await repos.signals.updateRouting(
      s1.signalId,
      {
        routingDecision: 'signal_card',
        battlecardUpdateTriggered: true,
        dealAlertCheckTriggered: false,
      },
      new Date(),
    );
    await repos.signals.updateRouting(
      s2.signalId,
      {
        routingDecision: 'archive',
        battlecardUpdateTriggered: false,
        dealAlertCheckTriggered: false,
      },
      new Date(),
    );

    const routed = await repos.signals.list(
      { routingDecision: 'signal_card' },
      { limit: 10, cursor: null },
    );
    expect(routed.items).toHaveLength(1);
    expect(routed.items[0]?.id).toBe(s1.signalId);
    expect(routed.items[0]?.rawText).toBe(s1.rawText); // SignalDetail join

    const byAction = await repos.signals.list(
      { actionType: 'pricing' },
      { limit: 10, cursor: null },
    );
    expect(byAction.items).toHaveLength(2);

    const bySignificance = await repos.signals.list(
      { minSignificance: 5, maxSignificance: 10 },
      { limit: 10, cursor: null },
    );
    expect(bySignificance.items.map((s) => s.id).sort()).toEqual([s1.signalId, s3.signalId].sort());

    const page1 = await repos.signals.list({}, { limit: 2, cursor: null });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await repos.signals.list({}, { limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it('listPendingScoring/listPendingRouting/listRouted expose the right queue slices', async () => {
    const s1 = await classifySignal({}, { contentHash: 'hash-1' });
    const s2 = await classifySignal({ actionType: 'product' }, { contentHash: 'hash-2' });
    const s3 = await classifySignal({ actionType: 'funding' }, { contentHash: 'hash-3' });

    // s1: classified only. s2: scored only. s3: scored + routed.
    await repos.signals.updateScore(s2.signalId, LOW_SCORES, new Date('2026-07-31T13:00:00.000Z'));
    await repos.signals.updateScore(s3.signalId, LOW_SCORES, new Date('2026-07-31T13:05:00.000Z'));
    await repos.signals.updateRouting(
      s3.signalId,
      {
        routingDecision: 'weekly_digest',
        battlecardUpdateTriggered: false,
        dealAlertCheckTriggered: true,
      },
      new Date('2026-07-31T14:00:00.000Z'),
    );

    const pendingScoring = await repos.signals.listPendingScoring(10);
    expect(pendingScoring.map((s) => s.id)).toEqual([s1.signalId]);

    const pendingRouting = await repos.signals.listPendingRouting(10);
    expect(pendingRouting.map((s) => s.id)).toEqual([s2.signalId]);

    const weekly = await repos.signals.listRouted('weekly_digest', 10);
    expect(weekly).toHaveLength(1);
    expect(weekly[0]?.id).toBe(s3.signalId);
    expect(weekly[0]?.competitorName).toBe('Globex');
    expect(weekly[0]?.dealAlertCheckTriggered).toBe(true);

    expect(await repos.signals.listRouted('signal_card', 10)).toHaveLength(0);
  });

  it('listRouted orders by routed_at desc and filters by decision', async () => {
    const s1 = await classifySignal({}, { contentHash: 'hash-1' });
    const s2 = await classifySignal({}, { contentHash: 'hash-2' });
    const s3 = await classifySignal({}, { contentHash: 'hash-3' });

    for (const id of [s1.signalId, s2.signalId, s3.signalId]) {
      await repos.signals.updateScore(id, LOW_SCORES, new Date());
    }
    await repos.signals.updateRouting(
      s1.signalId,
      {
        routingDecision: 'signal_card',
        battlecardUpdateTriggered: true,
        dealAlertCheckTriggered: false,
      },
      new Date('2026-07-31T10:00:00.000Z'),
    );
    await repos.signals.updateRouting(
      s2.signalId,
      {
        routingDecision: 'signal_card',
        battlecardUpdateTriggered: true,
        dealAlertCheckTriggered: false,
      },
      new Date('2026-07-31T11:00:00.000Z'),
    );
    await repos.signals.updateRouting(
      s3.signalId,
      {
        routingDecision: 'archive',
        battlecardUpdateTriggered: false,
        dealAlertCheckTriggered: false,
      },
      new Date('2026-07-31T12:00:00.000Z'),
    );

    const routed = await repos.signals.listRouted('signal_card', 10);
    expect(routed.map((s) => s.id)).toEqual([s2.signalId, s1.signalId]);
  });
});
