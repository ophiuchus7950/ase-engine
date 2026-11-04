import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { IngestRawSignalRequest } from '../types/domain';
import type { Repos } from './repo-types';
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

describe('RawSignalRepo', () => {
  let pool: Pool;
  let repos: Repos;
  let organizationId: string;
  let competitorA: string;
  let competitorB: string;

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
    competitorA = await insertCompetitor(pool, organizationId, 'Globex');
    competitorB = await insertCompetitor(pool, organizationId, 'Initech');
  });

  const request = (overrides: Partial<IngestRawSignalRequest> = {}): IngestRawSignalRequest =>
    ingestRequest(organizationId, competitorA, overrides);

  it('ingest inserts a new raw signal with created=true and a full mapping', async () => {
    const { signal, created } = await repos.rawSignals.ingest(request());

    expect(created).toBe(true);
    expect(signal.id).toBeTypeOf('string');
    expect(signal.organizationId).toBe(organizationId);
    expect(signal.competitorId).toBe(competitorA);
    expect(signal.dataSourceId).toBeNull();
    expect(signal.sourceType).toBe('competitor_website');
    expect(signal.rawText).toBe('Globex raised prices on the Enterprise plan.');
    expect(signal.sourceUrl).toBe('https://globex.example.com/pricing');
    expect(signal.collectionMethod).toBe('http_fetch');
    expect(signal.collectedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(signal.contentHash).toBe('hash-1');
    expect(signal.ingestedAt).toBeTypeOf('string');
  });

  it('ingest dedupes on (competitor_id, content_hash): second insert returns created=false and the existing row', async () => {
    const first = await repos.rawSignals.ingest(request());
    const second = await repos.rawSignals.ingest(request());

    expect(second.created).toBe(false);
    expect(second.signal.id).toBe(first.signal.id);
    expect(second.signal.ingestedAt).toBe(first.signal.ingestedAt);
    expect(second.signal.rawText).toBe(first.signal.rawText);
  });

  it('ingest allows the same content hash for a different competitor', async () => {
    const first = await repos.rawSignals.ingest(request());
    const second = await repos.rawSignals.ingest(request({ competitorId: competitorB }));

    expect(second.created).toBe(true);
    expect(second.signal.id).not.toBe(first.signal.id);
  });

  it('getById returns null for unknown ids and the mapped row otherwise', async () => {
    expect(await repos.rawSignals.getById('00000000-0000-0000-0000-000000000000')).toBeNull();

    const { signal } = await repos.rawSignals.ingest(request());
    const found = await repos.rawSignals.getById(signal.id);
    expect(found?.rawText).toBe(signal.rawText);
    expect(found?.contentHash).toBe('hash-1');
  });

  it('list filters by competitor/source/collection window and paginates', async () => {
    await repos.rawSignals.ingest(request());
    await repos.rawSignals.ingest(request({ sourceType: 'g2', contentHash: 'hash-2' }));
    await repos.rawSignals.ingest(
      request({ competitorId: competitorB, sourceType: 'news_rss', contentHash: 'hash-3' }),
    );

    const byCompetitor = await repos.rawSignals.list(
      { competitorId: competitorA },
      { limit: 10, cursor: null },
    );
    expect(byCompetitor.items).toHaveLength(2);

    const byType = await repos.rawSignals.list({ sourceType: 'g2' }, { limit: 10, cursor: null });
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0]?.sourceType).toBe('g2');

    const windowed = await repos.rawSignals.list(
      { collectedFrom: '2026-07-30T00:00:00.000Z', collectedTo: '2026-07-30T23:59:59.999Z' },
      { limit: 10, cursor: null },
    );
    expect(windowed.items).toHaveLength(3);

    const page1 = await repos.rawSignals.list({}, { limit: 2, cursor: null });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await repos.rawSignals.list({}, { limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it('listUnclassified returns only raw signals without a signals row', async () => {
    const a = await repos.rawSignals.ingest(request());
    await repos.rawSignals.ingest(request({ sourceType: 'g2', contentHash: 'hash-2' }));
    await repos.rawSignals.ingest(
      request({ competitorId: competitorB, sourceType: 'news_rss', contentHash: 'hash-3' }),
    );

    const before = await repos.rawSignals.listUnclassified(10);
    expect(before).toHaveLength(3);

    // Classify one of them → it leaves the unclassified queue.
    await repos.signals.createFromClassification(
      a.signal.id,
      organizationId,
      competitorA,
      classifyRequest(),
      new Date(),
    );
    const after = await repos.rawSignals.listUnclassified(10);
    expect(after).toHaveLength(2);
    expect(after.map((s) => s.id)).not.toContain(a.signal.id);
  });
});
