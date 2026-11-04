/**
 * Rivela ASE — internal HTTP API integration tests (ase_coding_standards.md §7).
 *
 * Run against a real Postgres test database `ase_test_api` (created + schema-
 * applied in beforeAll, TRUNCATE between tests). Requests go through
 * app.inject() — no server socket needed.
 *
 * Run: npx vitest run src/api
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRepos } from '../db/repos';
import { buildApp } from './app';
import type {
  DataSourceWire,
  PaginatedWire,
  RawSignalWire,
  SignalDetailWire,
  SignalWire,
} from './dto/schemas';

const DB_USER = 'ase';
const DB_PASSWORD = 'ase_dev_pw';
const DB_HOST = 'localhost';
const DB_PORT = 5432;
const TEST_DB_NAME = 'ase_test_api';
const MAINTENANCE_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;
const TEST_DB_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${TEST_DB_NAME}`;
const API_KEY = 'test-api-key';

const SCHEMA_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema.sql'), 'utf8');
const SCHEMA_002_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema_002.sql'), 'utf8');

let pool: Pool;
let app: FastifyInstance;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  const admin = new Pool({ connectionString: MAINTENANCE_URL });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await admin.end();

  pool = new Pool({ connectionString: TEST_DB_URL });
  await pool.query(SCHEMA_SQL);
  await pool.query(SCHEMA_002_SQL);
  app = buildApp(createRepos(pool), { apiKey: API_KEY });
  await app.ready();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE organizations, competitors, data_sources, raw_signals, signals, ' +
      'users, alert_rules, notifications, battlecards RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SeedResult {
  organizationId: string;
  competitorId: string;
}

async function seedOrg(orgName = 'Test Org', competitorName = 'Acme Corp'): Promise<SeedResult> {
  const org = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    [orgName],
  );
  const organizationId = org.rows[0]?.id;
  if (!organizationId) throw new Error('Failed to seed organization');
  const competitor = await pool.query<{ id: string }>(
    'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
    [organizationId, competitorName],
  );
  const competitorId = competitor.rows[0]?.id;
  if (!competitorId) throw new Error('Failed to seed competitor');
  return { organizationId, competitorId };
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-api-key': API_KEY, 'content-type': 'application/json', ...extra };
}

function createDataSourceBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    competitor_id: null,
    source_type: 'competitor_website',
    target_url: 'https://acme.example.com/pricing',
    collection_method: 'Playwright headless diff',
    refresh_interval_minutes: 240,
    ...overrides,
  };
}

function createDataSource(
  organizationId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: DataSourceWire }> {
  return app
    .inject({
      method: 'POST',
      url: `/v1/organizations/${organizationId}/data-sources`,
      headers: headers(),
      payload: createDataSourceBody(overrides),
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json<DataSourceWire>() }));
}

function ingestBody(
  organizationId: string,
  competitorId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organization_id: organizationId,
    competitor_id: competitorId,
    data_source_id: null,
    source_type: 'competitor_website',
    raw_text: 'Acme raised prices on the pro plan by 15%',
    source_url: 'https://acme.example.com/pricing',
    collection_method: 'Playwright headless diff',
    collected_at: '2026-07-30T12:00:00.000Z',
    content_hash: randomUUID(),
    ...overrides,
  };
}

function ingestRawSignal(
  organizationId: string,
  competitorId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: RawSignalWire }> {
  return app
    .inject({
      method: 'POST',
      url: '/v1/raw-signals',
      headers: headers(),
      payload: ingestBody(organizationId, competitorId, overrides),
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json<RawSignalWire>() }));
}

function classifySignal(
  rawSignalId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: SignalWire }> {
  return app
    .inject({
      method: 'POST',
      url: `/v1/raw-signals/${rawSignalId}/classify`,
      headers: headers(),
      payload: {
        action_type: 'pricing',
        confidence_level: 'high',
        key_facts: ['Pro plan price up 15%', 'Effective next quarter'],
        llm_model_used: 'opencode/deepseek-v4-flash-free',
        ...overrides,
      },
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json<SignalWire>() }));
}

async function scoreSignal(
  signalId: string,
  factors: Record<string, number> = {},
): Promise<{ statusCode: number; body: SignalWire }> {
  return app
    .inject({
      method: 'POST',
      url: `/v1/signals/${signalId}/score`,
      headers: headers(),
      payload: {
        score_recency: 2,
        score_source_authority: 2,
        score_action_type: 3,
        score_icp_relevance: 2,
        score_deal_stage_context: 2,
        score_novelty: 1,
        ...factors,
      },
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json<SignalWire>() }));
}

async function routeSignal(
  signalId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: SignalWire }> {
  return app
    .inject({
      method: 'POST',
      url: `/v1/signals/${signalId}/route`,
      headers: headers(),
      payload: {
        routing_decision: 'signal_card',
        battlecard_update_triggered: true,
        deal_alert_check_triggered: true,
        ...overrides,
      },
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.json<SignalWire>() }));
}

/** Full pipeline helper: ingest -> classify -> (optionally) score -> route. */
async function buildSignal(
  opts: {
    actionType?: string;
    score?: boolean;
    route?: boolean;
    org?: SeedResult;
  } = {},
) {
  const seeded = opts.org ?? (await seedOrg());
  const ingest = await ingestRawSignal(seeded.organizationId, seeded.competitorId);
  const classify = await classifySignal(ingest.body.id, {
    action_type: opts.actionType ?? 'pricing',
  });
  let signal = classify.body;
  if (opts.score) signal = (await scoreSignal(signal.id)).body;
  if (opts.route) signal = (await routeSignal(signal.id)).body;
  return { ...seeded, raw: ingest.body, signal };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('health', () => {
  it('GET /health returns ok without an API key', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('auth (X-API-Key)', () => {
  const URL = '/v1/organizations/550e8400-e29b-41d4-a716-446655440000/data-sources';

  it('rejects /v1 requests without a key (401 unauthorized)', async () => {
    const res = await app.inject({ method: 'GET', url: URL });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('rejects /v1 requests with a wrong key (401 unauthorized)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: URL,
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized', message: expect.any(String) });
  });

  it('accepts /v1 requests with the configured key', async () => {
    const res = await app.inject({ method: 'GET', url: URL, headers: headers() });
    expect(res.statusCode).toBe(200);
  });
});

describe('data sources', () => {
  it('creates a data source (201, snake_case wire)', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const { statusCode, body } = await createDataSource(organizationId, {
      competitor_id: competitorId,
      source_type: 'g2',
      target_url: null,
    });
    expect(statusCode).toBe(201);
    expect(body.organization_id).toBe(organizationId);
    expect(body.competitor_id).toBe(competitorId);
    expect(body.source_type).toBe('g2');
    expect(body.target_url).toBeNull();
    expect(body.collection_method).toBe('Playwright headless diff');
    expect(body.refresh_interval_minutes).toBe(240);
    expect(body.is_active).toBe(true);
    expect(body.last_collected_at).toBeNull();
    expect(body.created_at).toEqual(expect.any(String));
    expect(body.updated_at).toEqual(expect.any(String));
  });

  it('rejects invalid create bodies (bad enum, bad uuid -> 400 validation_error)', async () => {
    const { organizationId } = await seedOrg();
    const url = `/v1/organizations/${organizationId}/data-sources`;
    const badEnum = await app.inject({
      method: 'POST',
      url,
      headers: headers(),
      payload: createDataSourceBody({ source_type: 'bogus' }),
    });
    expect(badEnum.statusCode).toBe(400);
    expect(badEnum.json()).toMatchObject({ error: 'validation_error' });

    const badUuid = await app.inject({
      method: 'POST',
      url,
      headers: headers(),
      payload: createDataSourceBody({ competitor_id: 'not-a-uuid' }),
    });
    expect(badUuid.statusCode).toBe(400);
    expect(badUuid.json()).toMatchObject({ error: 'validation_error' });
  });

  it('lists data sources with filters and cursor pagination', async () => {
    const { organizationId, competitorId } = await seedOrg();
    await createDataSource(organizationId, {
      competitor_id: competitorId,
      target_url: 'https://a.example.com',
    });
    await createDataSource(organizationId, {
      competitor_id: competitorId,
      source_type: 'news_rss',
      target_url: 'https://b.example.com/rss',
    });
    await createDataSource(organizationId, {
      competitor_id: competitorId,
      target_url: 'https://c.example.com',
      refresh_interval_minutes: 60,
    });

    const page1 = await app.inject({
      method: 'GET',
      url: `/v1/organizations/${organizationId}/data-sources?limit=2`,
      headers: headers(),
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json<PaginatedWire<DataSourceWire>>();
    expect(body1.items).toHaveLength(2);
    expect(body1.limit).toBe(2);
    expect(body1.next_cursor).toEqual(expect.any(String));

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/organizations/${organizationId}/data-sources?limit=2&cursor=${body1.next_cursor}`,
      headers: headers(),
    });
    const body2 = page2.json<PaginatedWire<DataSourceWire>>();
    expect(body2.items).toHaveLength(1);
    expect(body2.next_cursor).toBeNull();

    const filtered = await app.inject({
      method: 'GET',
      url: `/v1/organizations/${organizationId}/data-sources?source_type=news_rss`,
      headers: headers(),
    });
    const filteredBody = filtered.json<PaginatedWire<DataSourceWire>>();
    expect(filteredBody.items).toHaveLength(1);
    expect(filteredBody.items[0]?.source_type).toBe('news_rss');
  });

  it('gets a data source by id and 404s when missing', async () => {
    const { organizationId } = await seedOrg();
    const created = await createDataSource(organizationId);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/data-sources/${created.body.id}`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<DataSourceWire>().id).toBe(created.body.id);

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/data-sources/550e8400-e29b-41d4-a716-446655440000',
      headers: headers(),
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'not_found' });
  });

  it('patches a data source (target_url, refresh_interval_minutes, is_active)', async () => {
    const { organizationId } = await seedOrg();
    const created = await createDataSource(organizationId);
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/data-sources/${created.body.id}`,
      headers: headers(),
      payload: { target_url: null, refresh_interval_minutes: 30, is_active: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<DataSourceWire>();
    expect(body.target_url).toBeNull();
    expect(body.refresh_interval_minutes).toBe(30);
    expect(body.is_active).toBe(false);

    const missing = await app.inject({
      method: 'PATCH',
      url: '/v1/data-sources/550e8400-e29b-41d4-a716-446655440000',
      headers: headers(),
      payload: { is_active: false },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('soft-deletes a data source (204) — deactivated but still fetchable', async () => {
    const { organizationId } = await seedOrg();
    const created = await createDataSource(organizationId);
    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/data-sources/${created.body.id}`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(del.statusCode).toBe(204);
    // Spec §1 + repo contract: DELETE is a soft remove (is_active = false)
    const after = await app.inject({
      method: 'GET',
      url: `/v1/data-sources/${created.body.id}`,
      headers: headers(),
    });
    expect(after.statusCode).toBe(200);
    expect(after.json<DataSourceWire>().is_active).toBe(false);
  });

  it('lists due sources and marks them collected', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const due = (
      await createDataSource(organizationId, {
        competitor_id: competitorId,
        refresh_interval_minutes: 60,
      })
    ).body;
    const fresh = (
      await createDataSource(organizationId, {
        competitor_id: competitorId,
        refresh_interval_minutes: 60,
      })
    ).body;
    await pool.query(
      "UPDATE data_sources SET last_collected_at = now() - interval '2 hours' WHERE id = $1",
      [due.id],
    );
    await pool.query('UPDATE data_sources SET last_collected_at = now() WHERE id = $1', [fresh.id]);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/data-sources/due',
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    const { items } = res.json<{ items: DataSourceWire[] }>();
    expect(items.map((d) => d.id)).toEqual([due.id]);

    const marked = await app.inject({
      method: 'POST',
      url: `/v1/data-sources/${due.id}/mark-collected`,
      headers: { 'x-api-key': API_KEY },
    });
    expect(marked.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: `/v1/data-sources/${due.id}`,
      headers: headers(),
    });
    expect(after.json<DataSourceWire>().last_collected_at).not.toBeNull();

    const res2 = await app.inject({
      method: 'GET',
      url: '/v1/data-sources/due',
      headers: headers(),
    });
    expect(res2.json<{ items: DataSourceWire[] }>().items).toHaveLength(0);
  });
});

describe('raw signals', () => {
  it('ingests a raw signal (201) and dedups on (competitor_id, content_hash) (200)', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const hash = 'sha256-abc123';
    const first = await ingestRawSignal(organizationId, competitorId, { content_hash: hash });
    expect(first.statusCode).toBe(201);
    expect(first.body.competitor_id).toBe(competitorId);
    expect(first.body.content_hash).toBe(hash);
    expect(first.body.raw_text).toBe('Acme raised prices on the pro plan by 15%');

    const dup = await ingestRawSignal(organizationId, competitorId, { content_hash: hash });
    expect(dup.statusCode).toBe(200);
    expect(dup.body.id).toBe(first.body.id);

    // Same hash under a different competitor is a NEW signal
    const otherCompetitor = (await seedOrg('Other Org', 'Globex')).competitorId;
    const other = await ingestRawSignal(organizationId, otherCompetitor, { content_hash: hash });
    expect(other.statusCode).toBe(201);
    expect(other.body.id).not.toBe(first.body.id);
  });

  it('rejects invalid ingest bodies (400 validation_error)', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const badType = await app.inject({
      method: 'POST',
      url: '/v1/raw-signals',
      headers: headers(),
      payload: ingestBody(organizationId, competitorId, { source_type: 'carrier_pigeon' }),
    });
    expect(badType.statusCode).toBe(400);
    expect(badType.json()).toMatchObject({ error: 'validation_error' });

    const noText = await app.inject({
      method: 'POST',
      url: '/v1/raw-signals',
      headers: headers(),
      payload: ingestBody(organizationId, competitorId, { raw_text: '' }),
    });
    expect(noText.statusCode).toBe(400);
  });

  it('gets a raw signal by id and 404s when missing', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const ingest = await ingestRawSignal(organizationId, competitorId);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/raw-signals/${ingest.body.id}`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<RawSignalWire>().id).toBe(ingest.body.id);

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/raw-signals/550e8400-e29b-41d4-a716-446655440000',
      headers: headers(),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('lists raw signals with filters', async () => {
    const { organizationId, competitorId } = await seedOrg();
    await ingestRawSignal(organizationId, competitorId, {
      source_type: 'news_rss',
      raw_text: 'rss item one',
      collected_at: '2026-07-01T00:00:00.000Z',
    });
    await ingestRawSignal(organizationId, competitorId, {
      source_type: 'g2',
      raw_text: 'g2 review',
      collected_at: '2026-07-15T00:00:00.000Z',
    });

    const byType = await app.inject({
      method: 'GET',
      url: '/v1/raw-signals?source_type=news_rss',
      headers: headers(),
    });
    const byTypeBody = byType.json<PaginatedWire<RawSignalWire>>();
    expect(byTypeBody.items).toHaveLength(1);
    expect(byTypeBody.items[0]?.raw_text).toBe('rss item one');

    const byRange = await app.inject({
      method: 'GET',
      url: '/v1/raw-signals?collected_from=2026-07-10T00:00:00.000Z&collected_to=2026-07-20T00:00:00.000Z',
      headers: headers(),
    });
    const byRangeBody = byRange.json<PaginatedWire<RawSignalWire>>();
    expect(byRangeBody.items).toHaveLength(1);
    expect(byRangeBody.items[0]?.source_type).toBe('g2');

    const byCompetitor = await app.inject({
      method: 'GET',
      url: `/v1/raw-signals?competitor_id=${competitorId}`,
      headers: headers(),
    });
    expect(byCompetitor.json<PaginatedWire<RawSignalWire>>().items).toHaveLength(2);
  });

  it('lists unclassified raw signals only (classification worker queue)', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const first = await ingestRawSignal(organizationId, competitorId);
    await ingestRawSignal(organizationId, competitorId, { raw_text: 'second unclassified item' });
    const classify = await classifySignal(first.body.id);
    expect(classify.statusCode).toBe(201);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/raw-signals/unclassified',
      headers: headers(),
    });
    const { items } = res.json<{ items: RawSignalWire[] }>();
    expect(items).toHaveLength(1);
    expect(items[0]?.id).not.toBe(first.body.id);
  });
});

describe('signals lifecycle (classify -> score -> route)', () => {
  it('classifies a raw signal into a signal (201)', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const ingest = await ingestRawSignal(organizationId, competitorId);
    const classify = await classifySignal(ingest.body.id);
    expect(classify.statusCode).toBe(201);
    const { body } = classify;
    expect(body.raw_signal_id).toBe(ingest.body.id);
    expect(body.action_type).toBe('pricing');
    expect(body.confidence_level).toBe('high');
    expect(body.key_facts).toHaveLength(2);
    expect(body.llm_model_used).toBe('opencode/deepseek-v4-flash-free');
    expect(body.classified_at).not.toBeNull();
    // Placeholder values per repo contract (overwritten by score/route stages)
    expect(body.significance_score).toBe(1);
    expect(body.routing_decision).toBe('archive');
    expect(body.scored_at).toBeNull();
    expect(body.routed_at).toBeNull();
  });

  it('classify returns 404 for a missing raw signal and 409 on double classify', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const missing = await classifySignal('550e8400-e29b-41d4-a716-446655440000');
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toMatchObject({ error: 'not_found' });

    const ingest = await ingestRawSignal(organizationId, competitorId);
    expect((await classifySignal(ingest.body.id)).statusCode).toBe(201);
    const second = await classifySignal(ingest.body.id);
    expect(second.statusCode).toBe(409);
    expect(second.body).toMatchObject({ error: 'conflict' });
  });

  it('rejects classify with too many key_facts (400 validation_error)', async () => {
    const { organizationId, competitorId } = await seedOrg();
    const ingest = await ingestRawSignal(organizationId, competitorId);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/raw-signals/${ingest.body.id}/classify`,
      headers: headers(),
      payload: {
        action_type: 'pricing',
        confidence_level: 'high',
        key_facts: ['a', 'b', 'c', 'd'],
        llm_model_used: 'model-x',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_error' });
  });

  it('scores a signal, clamping significance to 10 when the factors exceed the cap', async () => {
    const { signal } = await buildSignal();
    const scored = await scoreSignal(signal.id, {
      score_recency: 5,
      score_source_authority: 5,
      score_action_type: 5,
      score_icp_relevance: 5,
      score_deal_stage_context: 5,
      score_novelty: 5,
    });
    expect(scored.statusCode).toBe(200);
    expect(scored.body.significance_score).toBe(10);
    expect(scored.body.scored_at).not.toBeNull();
  });

  it('scores a signal, clamping significance to 1 when the factors sum below the floor', async () => {
    const { signal } = await buildSignal();
    const scored = await scoreSignal(signal.id, {
      score_recency: 0,
      score_source_authority: 0,
      score_action_type: 0,
      score_icp_relevance: 0,
      score_deal_stage_context: 0,
      score_novelty: 0,
    });
    expect(scored.statusCode).toBe(200);
    expect(scored.body.significance_score).toBe(1);
  });

  it('routes a signal (routing decision + flags stored)', async () => {
    const { signal } = await buildSignal();
    const routed = await routeSignal(signal.id, {
      routing_decision: 'weekly_digest',
      battlecard_update_triggered: false,
      deal_alert_check_triggered: true,
    });
    expect(routed.statusCode).toBe(200);
    expect(routed.body.routing_decision).toBe('weekly_digest');
    expect(routed.body.battlecard_update_triggered).toBe(false);
    expect(routed.body.deal_alert_check_triggered).toBe(true);
    expect(routed.body.routed_at).not.toBeNull();
  });

  it('rejects invalid route bodies and non-uuid ids (400 validation_error)', async () => {
    const badDecision = await app.inject({
      method: 'POST',
      url: '/v1/signals/550e8400-e29b-41d4-a716-446655440000/route',
      headers: headers(),
      payload: {
        routing_decision: 'telegram',
        battlecard_update_triggered: false,
        deal_alert_check_triggered: false,
      },
    });
    expect(badDecision.statusCode).toBe(400);
    expect(badDecision.json()).toMatchObject({ error: 'validation_error' });

    const badId = await app.inject({
      method: 'GET',
      url: '/v1/data-sources/not-a-uuid',
      headers: headers(),
    });
    expect(badId.statusCode).toBe(400);
    expect(badId.json()).toMatchObject({ error: 'validation_error' });
  });

  it('gets signal detail including raw text and competitor name', async () => {
    const { signal } = await buildSignal({ score: true, route: true });
    const res = await app.inject({
      method: 'GET',
      url: `/v1/signals/${signal.id}`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<SignalDetailWire>();
    expect(body.raw_text).toBe('Acme raised prices on the pro plan by 15%');
    expect(body.source_type).toBe('competitor_website');
    expect(body.source_url).toBe('https://acme.example.com/pricing');
    expect(body.collected_at).toEqual(expect.any(String));
    expect(body.competitor_name).toBe('Acme Corp');
    expect(body.significance_score).toBe(10);
    expect(body.routing_decision).toBe('signal_card');
  });

  it('lists signals with filters (action_type, routing_decision, significance range)', async () => {
    const org = await seedOrg();
    const a = await buildSignal({ actionType: 'pricing', score: true, route: true, org });
    const b = await buildSignal({ actionType: 'personnel', org });
    const { organizationId } = a;

    const byAction = await app.inject({
      method: 'GET',
      url: '/v1/signals?action_type=pricing',
      headers: headers(),
    });
    const byActionBody = byAction.json<PaginatedWire<SignalDetailWire>>();
    expect(byActionBody.items.map((s) => s.id)).toEqual([a.signal.id]);

    const byRouting = await app.inject({
      method: 'GET',
      url: '/v1/signals?routing_decision=signal_card',
      headers: headers(),
    });
    expect(byRouting.json<PaginatedWire<SignalDetailWire>>().items.map((s) => s.id)).toEqual([
      a.signal.id,
    ]);

    const bySignificance = await app.inject({
      method: 'GET',
      url: '/v1/signals?min_significance=10&max_significance=10',
      headers: headers(),
    });
    expect(bySignificance.json<PaginatedWire<SignalDetailWire>>().items.map((s) => s.id)).toEqual([
      a.signal.id,
    ]);

    const byOrg = await app.inject({
      method: 'GET',
      url: `/v1/signals?organization_id=${organizationId}`,
      headers: headers(),
    });
    const byOrgBody = byOrg.json<PaginatedWire<SignalDetailWire>>();
    expect(byOrgBody.items).toHaveLength(2);
    expect(byOrgBody.items.some((s) => s.id === b.signal.id)).toBe(true);
  });

  it('serves the pending-scoring and pending-routing worker queues', async () => {
    const { signal } = await buildSignal();
    expect(signal.scored_at).toBeNull();

    const pendingScoring = await app.inject({
      method: 'GET',
      url: '/v1/signals/pending-scoring',
      headers: headers(),
    });
    const scoringItems = pendingScoring.json<{ items: SignalWire[] }>().items;
    expect(scoringItems.map((s) => s.id)).toEqual([signal.id]);

    // Once scored, it leaves pending-scoring and enters pending-routing
    const scored = await scoreSignal(signal.id);
    expect(scored.body.scored_at).not.toBeNull();

    const pendingScoring2 = await app.inject({
      method: 'GET',
      url: '/v1/signals/pending-scoring',
      headers: headers(),
    });
    expect(pendingScoring2.json<{ items: SignalWire[] }>().items).toHaveLength(0);

    const pendingRouting = await app.inject({
      method: 'GET',
      url: '/v1/signals/pending-routing',
      headers: headers(),
    });
    expect(pendingRouting.json<{ items: SignalWire[] }>().items.map((s) => s.id)).toEqual([
      signal.id,
    ]);
  });

  it('serves the routed queue filtered by routing_decision', async () => {
    const { signal } = await buildSignal({ score: true });
    await routeSignal(signal.id, { routing_decision: 'signal_card' });

    const missing = await app.inject({
      method: 'GET',
      url: '/v1/signals/routed',
      headers: headers(),
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: 'validation_error' });

    const signalCard = await app.inject({
      method: 'GET',
      url: '/v1/signals/routed?routing_decision=signal_card',
      headers: headers(),
    });
    const cardItems = signalCard.json<{ items: SignalDetailWire[] }>().items;
    expect(cardItems.map((s) => s.id)).toEqual([signal.id]);

    const digest = await app.inject({
      method: 'GET',
      url: '/v1/signals/routed?routing_decision=weekly_digest',
      headers: headers(),
    });
    expect(digest.json<{ items: SignalDetailWire[] }>().items).toHaveLength(0);
  });

  it('404s on score/route for missing signals', async () => {
    const url = '/v1/signals/550e8400-e29b-41d4-a716-446655440000';
    const score = await app.inject({
      method: 'POST',
      url: `${url}/score`,
      headers: headers(),
      payload: {
        score_recency: 1,
        score_source_authority: 1,
        score_action_type: 1,
        score_icp_relevance: 1,
        score_deal_stage_context: 1,
        score_novelty: 1,
      },
    });
    expect(score.statusCode).toBe(404);
    expect(score.json()).toMatchObject({ error: 'not_found' });

    const route = await app.inject({
      method: 'POST',
      url: `${url}/route`,
      headers: headers(),
      payload: {
        routing_decision: 'archive',
        battlecard_update_triggered: false,
        deal_alert_check_triggered: false,
      },
    });
    expect(route.statusCode).toBe(404);

    const get = await app.inject({ method: 'GET', url, headers: headers() });
    expect(get.statusCode).toBe(404);
  });
});
