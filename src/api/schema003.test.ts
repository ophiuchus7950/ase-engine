/**
 * Rivela ASE — schema 003 integration tests: battlecard automation + history.
 *
 * Covers the Workstream A behavior against a real Postgres test database
 * `ase_test_003`:
 *   (a) routing a signal_card signal auto-creates a battlecard + appends a
 *       battlecard_versions row with trigger='routing';
 *   (b) POST /v1/battlecards/reconcile regenerates stale competitors
 *       (trigger='worker') and is idempotent when nothing is stale;
 *   (c) manual POST .../battlecard/update appends a trigger='manual' version;
 *   (d) GET .../battlecard/history lists versions newest-first.
 *
 * Run: npx vitest run src/api/schema003.test.ts
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import { createRepos } from '../db/repos';
import { buildApp } from './app';
import type { BattlecardVersionWire, SignalDetailWire } from './dto/schemas';

// Derive the dedicated test database from DATABASE_URL (same contract as
// src/db/test-db.ts), so `DATABASE_URL=... npm test` runs anywhere.
const BASE_DATABASE_URL = config.DATABASE_URL.replace(/\/[^/]*$/, '');
const TEST_DB_NAME = 'ase_test_003';
const MAINTENANCE_URL = `${BASE_DATABASE_URL}/postgres`;
const TEST_DB_URL = `${BASE_DATABASE_URL}/${TEST_DB_NAME}`;

const SCHEMA_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema.sql'), 'utf8');
const SCHEMA_002_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema_002.sql'), 'utf8');
const SCHEMA_003_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema_003.sql'), 'utf8');

let pool: Pool;
let app: FastifyInstance;

beforeAll(async () => {
  const admin = new Pool({ connectionString: MAINTENANCE_URL });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await admin.end();

  pool = new Pool({ connectionString: TEST_DB_URL });
  await pool.query(SCHEMA_SQL);
  await pool.query(SCHEMA_002_SQL);
  await pool.query(SCHEMA_003_SQL);
  app = buildApp(createRepos(pool));
  await app.ready();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE organizations, competitors, data_sources, raw_signals, signals, ' +
      'users, alert_rules, notifications, battlecards, battlecard_versions ' +
      'RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'content-type': 'application/json', ...extra };
}

/** Seed an org via users (so getDefaultOrganizationId works) + a competitor. */
async function seedOrgAndCompetitor(
  name = 'Test Org',
  competitorName = 'Acme',
): Promise<{ organizationId: string; competitorId: string }> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    [name],
  );
  const organizationId = rows[0]!.id;
  const comp = await pool.query<{ id: string }>(
    'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
    [organizationId, competitorName],
  );
  const { rows: userRows } = await pool.query<{ name: string }>(
    'INSERT INTO users (organization_id, name, password_hash) VALUES ($1, $2, $3) RETURNING NAME',
    [organizationId, 'Test User', 'x'],
  );
  expect(userRows[0]!.name).toBe('Test User');
  return { organizationId, competitorId: comp.rows[0]!.id };
}

/**
 * Seed the local org + a competitor. The local user is auto-created by the
 * app's attachLocalUser hook on the first /v1 request.
 */
async function registerSessionAndCompetitor(
  competitorName = 'Acme',
): Promise<{ organizationId: string; competitorId: string }> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    ['Test Org'],
  );
  const organizationId = rows[0]!.id;
  const comp = await pool.query<{ id: string }>(
    'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
    [organizationId, competitorName],
  );
  return { organizationId, competitorId: comp.rows[0]!.id };
}

/** Full pipeline seed through route (routes to signal_card, high significance). */
async function routeSignalCard(
  organizationId: string,
  competitorId: string,
): Promise<SignalDetailWire> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO raw_signals
       (organization_id, competitor_id, source_type, raw_text, source_url, collection_method, collected_at, content_hash)
     VALUES ($1, $2, 'competitor_website', $3, 'https://acme.example.com/pricing', 'http_fetch', now(), $4)
     RETURNING id`,
    [organizationId, competitorId, 'Acme raised prices on the pro plan by 15%', randomUUID()],
  );
  const rawSignalId = rows[0]!.id;

  const classify = await app.inject({
    method: 'POST',
    url: `/v1/raw-signals/${rawSignalId}/classify`,
    headers: authHeaders(),
    payload: {
      action_type: 'pricing',
      confidence_level: 'high',
      key_facts: ['Acme raised prices on the pro plan by 15%'],
      llm_model_used: 'test-model',
    },
  });
  const signal = classify.json<SignalDetailWire>();

  await app.inject({
    method: 'POST',
    url: `/v1/signals/${signal.id}/score`,
    headers: authHeaders(),
    payload: {
      score_recency: 5,
      score_source_authority: 5,
      score_action_type: 5,
      score_icp_relevance: 5,
      score_deal_stage_context: 5,
      score_novelty: 5,
    },
  });

  await app.inject({
    method: 'POST',
    url: `/v1/signals/${signal.id}/route`,
    headers: authHeaders(),
    payload: {
      routing_decision: 'signal_card',
      battlecard_update_triggered: true,
      deal_alert_check_triggered: false,
    },
  });

  const detail = await app.inject({
    method: 'GET',
    url: `/v1/signals/${signal.id}`,
    headers: authHeaders(),
  });
  return detail.json<SignalDetailWire>();
}

/**
 * Insert a signal_card signal directly (bypassing the routing trigger) so the
 * battlecard is left "stale" — a signal routed after the current generated_at.
 * Used to exercise reconciliation without the in-process trigger masking it.
 */
async function insertStaleSignalCard(
  organizationId: string,
  competitorId: string,
  routedAt: string,
): Promise<string> {
  const raw = await pool.query<{ id: string }>(
    `INSERT INTO raw_signals
       (organization_id, competitor_id, source_type, raw_text, source_url, collection_method, collected_at, content_hash)
     VALUES ($1, $2, 'competitor_website', $3, 'https://acme.example.com/pricing', 'http_fetch', now(), $4)
     RETURNING id`,
    [organizationId, competitorId, 'Acme cut Enterprise pricing', randomUUID()],
  );
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO signals
       (raw_signal_id, organization_id, competitor_id, action_type, confidence_level, key_facts,
        classified_at, score_recency, score_source_authority, score_action_type, score_icp_relevance,
        score_deal_stage_context, score_novelty, significance_score, scored_at, routing_decision,
        battlecard_update_triggered, deal_alert_check_triggered, routed_at, bookmarked, created_at)
     VALUES ($1, $2, $3, 'pricing', 'high', $4::jsonb, now(),
             5, 5, 5, 5, 5, 5, 10, now(), 'signal_card',
             true, false, $5, false, now())
     RETURNING id`,
    [
      raw.rows[0]!.id,
      organizationId,
      competitorId,
      JSON.stringify(['Acme cut Enterprise pricing']),
      routedAt,
    ],
  );
  return rows[0]!.id;
}

async function countVersions(competitorId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM battlecard_versions WHERE competitor_id = $1',
    [competitorId],
  );
  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// (a) Routing a signal_card signal auto-creates a battlecard + history
// ---------------------------------------------------------------------------

describe('routing-time battlecard trigger', () => {
  it('routing a signal_card signal creates a battlecard and appends a routing version', async () => {
    const { organizationId, competitorId } = await seedOrgAndCompetitor();

    await routeSignalCard(organizationId, competitorId);

    const bc = await pool.query<{ competitor_id: string }>(
      'SELECT competitor_id FROM battlecards WHERE competitor_id = $1',
      [competitorId],
    );
    expect(bc.rows).toHaveLength(1);

    const versions = await pool.query<{
      trigger: string;
      triggered_by_signal_id: string | null;
      source_signal_count: number;
    }>(
      'SELECT trigger, triggered_by_signal_id, source_signal_count FROM battlecard_versions WHERE competitor_id = $1',
      [competitorId],
    );
    expect(versions.rows).toHaveLength(1);
    expect(versions.rows[0]!.trigger).toBe('routing');
    expect(versions.rows[0]!.source_signal_count).toBe(1);
    expect(versions.rows[0]!.triggered_by_signal_id).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b) Reconcile endpoint: regenerates stale competitors, idempotent when fresh
// ---------------------------------------------------------------------------

describe('battlecard reconcile endpoint', () => {
  it('is idempotent when nothing is stale (no duplicate version)', async () => {
    const { organizationId, competitorId } = await seedOrgAndCompetitor();
    await routeSignalCard(organizationId, competitorId);
    const before = await countVersions(competitorId);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/battlecards/reconcile',
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ regenerated: number; competitors: unknown[] }>();
    expect(body.regenerated).toBe(0);
    expect(body.competitors).toHaveLength(0);
    expect(await countVersions(competitorId)).toBe(before);
  });

  it('regenerates a stale competitor under trigger=worker', async () => {
    const { organizationId, competitorId } = await seedOrgAndCompetitor();
    await routeSignalCard(organizationId, competitorId);
    const before = await countVersions(competitorId);

    await insertStaleSignalCard(organizationId, competitorId, '2999-01-01T00:00:00.000Z');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/battlecards/reconcile',
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      regenerated: number;
      competitors: { competitor_id: string; competitor_name: string }[];
    }>();
    expect(body.regenerated).toBe(1);
    expect(body.competitors[0]!.competitor_id).toBe(competitorId);

    const { rows } = await pool.query<{ trigger: string }>(
      'SELECT trigger FROM battlecard_versions WHERE competitor_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [competitorId],
    );
    expect(rows[0]!.trigger).toBe('worker');
    expect(await countVersions(competitorId)).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// (c) Manual update appends a trigger='manual' version
// ---------------------------------------------------------------------------

describe('manual battlecard update', () => {
  it('POST update appends a manual version and keeps the current doc', async () => {
    const { organizationId, competitorId } = await registerSessionAndCompetitor();
    await routeSignalCard(organizationId, competitorId);
    const before = await countVersions(competitorId);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/competitors/${competitorId}/battlecard/update`,
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const { rows } = await pool.query<{ trigger: string }>(
      'SELECT trigger FROM battlecard_versions WHERE competitor_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [competitorId],
    );
    expect(rows[0]!.trigger).toBe('manual');
    expect(await countVersions(competitorId)).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// (d) History endpoint lists versions newest-first
// ---------------------------------------------------------------------------

describe('battlecard history endpoint', () => {
  it('GET history lists versions newest-first', async () => {
    const { organizationId, competitorId } = await registerSessionAndCompetitor();
    await routeSignalCard(organizationId, competitorId); // routing version
    await app.inject({
      method: 'POST',
      url: `/v1/competitors/${competitorId}/battlecard/update`,
      headers: authHeaders(),
      payload: {},
    }); // manual version: newest

    const res = await app.inject({
      method: 'GET',
      url: `/v1/competitors/${competitorId}/battlecard/history`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const { items } = res.json<{
      items: BattlecardVersionWire[];
      next_cursor: string | null;
    }>();
    expect(items).toHaveLength(2);
    expect(items[0]!.trigger).toBe('manual');
    expect(items[1]!.trigger).toBe('routing');
    expect(items[0]!.generated_at >= items[1]!.generated_at).toBe(true);
    expect(items[0]!.source_signal_count).toBeGreaterThanOrEqual(1);
  });
});
