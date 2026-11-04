import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CreateDataSourceRequest } from '../types/domain';
import type { Repos } from './repo-types';
import {
  applyTestSchema,
  createTestPool,
  createTestRepos,
  ensureTestDatabase,
  insertCompetitor,
  insertOrganization,
  resetTestDb,
} from './test-db';

describe('DataSourceRepo', () => {
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

  const createRequest = (
    overrides: Partial<CreateDataSourceRequest> = {},
  ): CreateDataSourceRequest => ({
    competitorId,
    sourceType: 'competitor_website',
    targetUrl: 'https://globex.example.com/pricing',
    collectionMethod: 'http_fetch',
    refreshIntervalMinutes: 240,
    ...overrides,
  });

  it('create returns a fully mapped DataSource', async () => {
    const ds = await repos.dataSources.create(organizationId, createRequest());

    expect(ds.id).toBeTypeOf('string');
    expect(ds.organizationId).toBe(organizationId);
    expect(ds.competitorId).toBe(competitorId);
    expect(ds.sourceType).toBe('competitor_website');
    expect(ds.targetUrl).toBe('https://globex.example.com/pricing');
    expect(ds.collectionMethod).toBe('http_fetch');
    expect(ds.refreshIntervalMinutes).toBe(240);
    expect(ds.isActive).toBe(true);
    expect(ds.lastCollectedAt).toBeNull();
    expect(ds.createdAt).toBeTypeOf('string');
    expect(ds.updatedAt).toBeTypeOf('string');
  });

  it('getById returns null for unknown ids and the mapped row otherwise', async () => {
    expect(await repos.dataSources.getById('00000000-0000-0000-0000-000000000000')).toBeNull();

    const created = await repos.dataSources.create(organizationId, createRequest());
    const found = await repos.dataSources.getById(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.sourceType).toBe('competitor_website');
    expect(found?.isActive).toBe(true);
  });

  it('list filters by competitorId, sourceType and isActive', async () => {
    await repos.dataSources.create(organizationId, createRequest());
    await repos.dataSources.create(organizationId, {
      ...createRequest(),
      sourceType: 'g2',
      targetUrl: 'https://www.g2.com/products/globex/reviews',
    });
    const third = await repos.dataSources.create(organizationId, {
      ...createRequest(),
      sourceType: 'news_rss',
    });
    await repos.dataSources.update(third.id, { isActive: false });

    const byCompetitor = await repos.dataSources.list(
      organizationId,
      { competitorId },
      { limit: 10, cursor: null },
    );
    expect(byCompetitor.items).toHaveLength(3);

    const byType = await repos.dataSources.list(
      organizationId,
      { sourceType: 'g2' },
      { limit: 10, cursor: null },
    );
    expect(byType.items).toHaveLength(1);
    expect(byType.items[0]?.sourceType).toBe('g2');

    const active = await repos.dataSources.list(
      organizationId,
      { isActive: true },
      { limit: 10, cursor: null },
    );
    expect(active.items).toHaveLength(2);

    const inactive = await repos.dataSources.list(
      organizationId,
      { isActive: false },
      { limit: 10, cursor: null },
    );
    expect(inactive.items).toHaveLength(1);
    expect(inactive.items[0]?.id).toBe(third.id);
  });

  it('list paginates with id cursors', async () => {
    for (let i = 0; i < 3; i += 1) {
      await repos.dataSources.create(organizationId, {
        ...createRequest(),
        targetUrl: `https://globex.example.com/page/${i}`,
      });
    }

    const first = await repos.dataSources.list(organizationId, {}, { limit: 2, cursor: null });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await repos.dataSources.list(
      organizationId,
      {},
      {
        limit: 2,
        cursor: first.nextCursor,
      },
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    // pages do not overlap
    const ids = [...first.items.map((ds) => ds.id), ...second.items.map((ds) => ds.id)];
    expect(new Set(ids).size).toBe(3);
  });

  it('update applies only the provided fields and returns null for unknown ids', async () => {
    const created = await repos.dataSources.create(organizationId, createRequest());
    const updated = await repos.dataSources.update(created.id, {
      targetUrl: 'https://globex.example.com/new-pricing',
      refreshIntervalMinutes: 60,
      isActive: false,
    });
    expect(updated?.targetUrl).toBe('https://globex.example.com/new-pricing');
    expect(updated?.refreshIntervalMinutes).toBe(60);
    expect(updated?.isActive).toBe(false);
    expect(updated?.sourceType).toBe('competitor_website');
    expect(updated?.collectionMethod).toBe('http_fetch');

    expect(
      await repos.dataSources.update('00000000-0000-0000-0000-000000000000', { isActive: true }),
    ).toBeNull();
  });

  it('remove soft-deletes (is_active = false) and reports whether a row was updated', async () => {
    const created = await repos.dataSources.create(organizationId, createRequest());

    expect(await repos.dataSources.remove(created.id)).toBe(true);
    expect((await repos.dataSources.getById(created.id))?.isActive).toBe(false);

    expect(await repos.dataSources.remove('00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('listDue returns never-collected and overdue sources; markCollected defers them', async () => {
    const now = new Date('2026-07-31T12:00:00.000Z');

    // never collected (last_collected_at NULL) → due
    const neverCollected = await repos.dataSources.create(organizationId, createRequest());

    // collected 2h ago, refresh 60m → overdue
    const overdue = await repos.dataSources.create(organizationId, {
      ...createRequest(),
      sourceType: 'g2',
      refreshIntervalMinutes: 60,
    });
    await repos.dataSources.markCollected(overdue.id, new Date(now.getTime() - 120 * 60 * 1000));

    // collected 30m ago, refresh 240m → not due
    const fresh = await repos.dataSources.create(organizationId, {
      ...createRequest(),
      sourceType: 'news_rss',
      refreshIntervalMinutes: 240,
    });
    await repos.dataSources.markCollected(fresh.id, new Date(now.getTime() - 30 * 60 * 1000));

    // inactive, never collected → never due
    const inactive = await repos.dataSources.create(organizationId, {
      ...createRequest(),
      sourceType: 'job_board',
    });
    await repos.dataSources.update(inactive.id, { isActive: false });

    const due = await repos.dataSources.listDue(now);
    expect(due.map((ds) => ds.id).sort()).toEqual([neverCollected.id, overdue.id].sort());

    // markCollected on the never-collected source removes it from the queue
    await repos.dataSources.markCollected(neverCollected.id, now);
    const dueAfter = await repos.dataSources.listDue(now);
    expect(dueAfter.map((ds) => ds.id)).not.toContain(neverCollected.id);
    expect(dueAfter.map((ds) => ds.id)).toContain(overdue.id);
    expect(dueAfter.map((ds) => ds.id)).not.toContain(fresh.id);
    expect(dueAfter.map((ds) => ds.id)).not.toContain(inactive.id);
  });
});
