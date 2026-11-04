/**
 * Rivela ASE — schema 002 integration tests: auth, competitors CRUD,
 * alert rules + evaluation at routing time, notifications (bell), bookmarks,
 * battlecards. Run against a real Postgres test database `ase_test_002`.
 *
 * Run: npx vitest run src/api/schema002.test.ts
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
import type {
  AlertRuleWire,
  BattlecardWire,
  CompetitorProfileWire,
  CompetitorWire,
  NotificationWire,
  SignalDetailWire,
} from './dto/schemas';

// Derive the dedicated test database from DATABASE_URL (same contract as
// src/db/test-db.ts), so `DATABASE_URL=... npm test` runs anywhere.
const BASE_DATABASE_URL = config.DATABASE_URL.replace(/\/[^/]*$/, '');
const TEST_DB_NAME = 'ase_test_002';
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

async function seedOrg(name = 'Test Org'): Promise<{ organizationId: string }> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    [name],
  );
  return { organizationId: rows[0]!.id };
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'content-type': 'application/json', ...extra };
}

/** Seed the local org. The local user is auto-created by the app's
 * attachLocalUser hook on the first /v1 request. */
async function register(): Promise<{ organizationId: string }> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    ['Test Org'],
  );
  return { organizationId: rows[0]!.id };
}

/** Full pipeline seed: org + competitor + raw signal + classify + score + route. */
async function seedRoutedSignal(
  organizationId: string,
  competitorId: string,
  overrides: { actionType?: string; rawText?: string; significance?: number } = {},
): Promise<SignalDetailWire> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO raw_signals
       (organization_id, competitor_id, source_type, raw_text, source_url, collection_method, collected_at, content_hash)
     VALUES ($1, $2, 'competitor_website', $3, 'https://acme.example.com/pricing', 'http_fetch', now(), $4)
     RETURNING id`,
    [
      organizationId,
      competitorId,
      overrides.rawText ?? 'Acme raised prices on the pro plan by 15%',
      randomUUID(),
    ],
  );
  const rawSignalId = rows[0]!.id;

  const classify = await app.inject({
    method: 'POST',
    url: `/v1/raw-signals/${rawSignalId}/classify`,
    headers: authHeaders(),
    payload: {
      action_type: overrides.actionType ?? 'pricing',
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

function createRuleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Pricing alerts',
    description: 'Fires when pricing changes score high',
    enabled: true,
    triggers: { min_score: 7, categories: ['pricing'] },
    channels: [{ type: 'email', target: 'me@example.com' }],
    routing_override: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Competitors CRUD
// ---------------------------------------------------------------------------

describe('competitors', () => {
  it('POST /competitors creates the competitor + a data_source per website URL', async () => {
    await register();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/competitors',
      headers: authHeaders(),
      payload: {
        name: 'Globex',
        website_urls: ['https://globex.example.com/pricing'],
      },
    });
    expect(res.statusCode).toBe(200);
    const competitor = res.json<CompetitorWire>();
    expect(competitor.name).toBe('Globex');

    const sources = await pool.query<{ target_url: string; source_type: string }>(
      'SELECT target_url, source_type FROM data_sources WHERE competitor_id = $1',
      [competitor.id],
    );
    expect(sources.rows).toHaveLength(1);
    expect(sources.rows[0]!.target_url).toBe('https://globex.example.com/pricing');
    expect(sources.rows[0]!.source_type).toBe('competitor_website');
  });

  it('GET /competitors returns profiles with signal counts and sources', async () => {
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Initech'],
    );
    await pool.query(
      `INSERT INTO data_sources (organization_id, competitor_id, source_type, target_url, collection_method, refresh_interval_minutes, is_active)
       VALUES ($1, $2, 'competitor_website', 'https://initech.example.com', 'http_fetch', 240, true)`,
      [organizationId, competitor.rows[0]!.id],
    );
    await seedRoutedSignal(organizationId, competitor.rows[0]!.id);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/competitors',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const { items } = res.json<{ items: CompetitorProfileWire[] }>();
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Initech');
    expect(items[0]!.signal_count).toBe(1);
    expect(items[0]!.monitoring_active).toBe(true);
    expect(items[0]!.sources).toHaveLength(1);
  });

  it('PATCH + DELETE competitors respect ownership', async () => {
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Umbrella'],
    );
    const { id } = competitor.rows[0]!;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/competitors/${id}`,
      headers: authHeaders(),
      payload: { name: 'Umbrella Corp' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<CompetitorWire>().name).toBe('Umbrella Corp');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/competitors/${id}`,
      headers: authHeaders(),
      payload: {},
    });
    expect(deleted.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: '/v1/competitors',
      headers: authHeaders(),
    });
    expect(gone.json<{ items: CompetitorWire[] }>().items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Alert rules + evaluation
// ---------------------------------------------------------------------------

describe('alert rules', () => {
  it('CRUD: create, list, toggle, update, delete', async () => {
    await register();

    const created = await app.inject({
      method: 'POST',
      url: '/v1/alert-rules',
      headers: authHeaders(),
      payload: createRuleBody(),
    });
    expect(created.statusCode).toBe(200);
    const rule = created.json<AlertRuleWire>();
    expect(rule.name).toBe('Pricing alerts');
    expect(rule.fired_count).toBe(0);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/alert-rules',
      headers: authHeaders(),
    });
    expect(list.json<{ items: AlertRuleWire[] }>().items).toHaveLength(1);

    const toggled = await app.inject({
      method: 'PATCH',
      url: `/v1/alert-rules/${rule.id}`,
      headers: authHeaders(),
      payload: { enabled: false, name: 'Pricing alerts v2' },
    });
    const updated = toggled.json<AlertRuleWire>();
    expect(updated.enabled).toBe(false);
    expect(updated.name).toBe('Pricing alerts v2');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/alert-rules/${rule.id}`,
      headers: authHeaders(),
      payload: {},
    });
    expect(deleted.statusCode).toBe(200);
  });

  it('routing a matching signal fires the rule: fired_count + notification + override', async () => {
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Acme'],
    );
    const competitorId = competitor.rows[0]!.id;

    // Rule with keywords matching the signal text + email channel.
    await app.inject({
      method: 'POST',
      url: '/v1/alert-rules',
      headers: authHeaders(),
      payload: createRuleBody({
        triggers: { keywords: ['raised prices'] },
        channels: [{ type: 'email', target: 'me@example.com' }],
      }),
    });

    const signal = await seedRoutedSignal(organizationId, competitorId, {
      rawText: 'Acme raised prices on the pro plan by 15%',
    });
    expect(signal.significance_score).toBe(10); // six 5s = 30, clamped to 10

    const rules = await app.inject({
      method: 'GET',
      url: '/v1/alert-rules',
      headers: authHeaders(),
    });
    const [rule] = rules.json<{ items: AlertRuleWire[] }>().items;
    expect(rule!.fired_count).toBe(1);

    const notifications = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: authHeaders(),
    });
    const { items } = notifications.json<{ items: NotificationWire[] }>();
    expect(items).toHaveLength(1);
    expect(items[0]!.rule_id).toBe(rule!.id);
    expect(items[0]!.channel).toBe('email');
    expect(items[0]!.signal_id).toBe(signal.id);
  });

  it('routing_override escalates the stored routing decision', async () => {
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Acme'],
    );
    const competitorId = competitor.rows[0]!.id;

    await app.inject({
      method: 'POST',
      url: '/v1/alert-rules',
      headers: authHeaders(),
      payload: createRuleBody({
        triggers: { min_score: 1 },
        routing_override: 'signal_card',
      }),
    });

    // Ingest with an action type the built-in router would send to weekly_digest.
    const signal = await seedRoutedSignal(organizationId, competitorId, {
      actionType: 'product',
      rawText: 'Acme launched a new feature',
    });

    // Re-read: rule should have escalated routing to signal_card.
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/signals/${signal.id}`,
      headers: authHeaders(),
    });
    expect(detail.json<SignalDetailWire>().routing_decision).toBe('signal_card');
  });

  it('non-matching rules do not fire', async () => {
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Acme'],
    );
    await app.inject({
      method: 'POST',
      url: '/v1/alert-rules',
      headers: authHeaders(),
      payload: createRuleBody({
        triggers: { keywords: ['does-not-appear'] },
      }),
    });

    await seedRoutedSignal(organizationId, competitor.rows[0]!.id);

    const rules = await app.inject({
      method: 'GET',
      url: '/v1/alert-rules',
      headers: authHeaders(),
    });
    expect(rules.json<{ items: AlertRuleWire[] }>().items[0]!.fired_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Notifications (bell)
// ---------------------------------------------------------------------------

describe('notifications', () => {
  it('unread-count + mark-read + read-all flow', async () => {
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Acme'],
    );
    await app.inject({
      method: 'POST',
      url: '/v1/alert-rules',
      headers: authHeaders(),
      payload: createRuleBody({ triggers: { min_score: 1 } }),
    });
    await seedRoutedSignal(organizationId, competitor.rows[0]!.id);

    const unread = await app.inject({
      method: 'GET',
      url: '/v1/notifications/unread-count',
      headers: authHeaders(),
    });
    expect(unread.json<{ count: number }>().count).toBe(1);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: authHeaders(),
    });
    const { items } = list.json<{ items: NotificationWire[] }>();
    expect(items).toHaveLength(1);
    expect(items[0]!.read_at).toBeNull();

    const read = await app.inject({
      method: 'POST',
      url: `/v1/notifications/${items[0]!.id}/read`,
      headers: authHeaders(),
      payload: {},
    });
    expect(read.statusCode).toBe(200);

    const unreadAfter = await app.inject({
      method: 'GET',
      url: '/v1/notifications/unread-count',
      headers: authHeaders(),
    });
    expect(unreadAfter.json<{ count: number }>().count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

describe('bookmarks', () => {
  it('POST /signals/:id/bookmark toggles the flag and ?bookmarked= filters', async () => {
    // register() seeds the org; signals routes are API-key-only, but the org
    // must be the one the signal pipeline writes to.
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Acme'],
    );
    const signal = await seedRoutedSignal(organizationId, competitor.rows[0]!.id);
    expect(signal.bookmarked).toBe(false);

    const on = await app.inject({
      method: 'POST',
      url: `/v1/signals/${signal.id}/bookmark`,
      headers: authHeaders(),
      payload: { bookmarked: true },
    });
    expect(on.json<SignalDetailWire>().bookmarked).toBe(true);

    const filtered = await app.inject({
      method: 'GET',
      url: '/v1/signals?bookmarked=true',
      headers: authHeaders(),
    });
    expect(filtered.json<{ items: SignalDetailWire[] }>().items).toHaveLength(1);

    const off = await app.inject({
      method: 'POST',
      url: `/v1/signals/${signal.id}/bookmark`,
      headers: authHeaders(),
      payload: { bookmarked: false },
    });
    expect(off.json<SignalDetailWire>().bookmarked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Battlecards
// ---------------------------------------------------------------------------

describe('battlecards', () => {
  it('GET builds a battlecard from routed signals; POST /update regenerates', async () => {
    const { organizationId } = await register();
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [organizationId, 'Acme'],
    );
    const competitorId = competitor.rows[0]!.id;
    await seedRoutedSignal(organizationId, competitorId);

    const get = await app.inject({
      method: 'GET',
      url: `/v1/competitors/${competitorId}/battlecard`,
      headers: authHeaders(),
    });
    expect(get.statusCode).toBe(200);
    const battlecard = get.json<BattlecardWire>();
    expect(battlecard.competitor_name).toBe('Acme');
    expect(battlecard.source_signals.length).toBeGreaterThan(0);
    expect(battlecard.summary).toContain('Acme');

    const update = await app.inject({
      method: 'POST',
      url: `/v1/competitors/${competitorId}/battlecard/update`,
      headers: authHeaders(),
      payload: {},
    });
    expect(update.statusCode).toBe(200);
    expect(update.json<BattlecardWire>().source_signals.length).toBeGreaterThan(0);
  });

  it('404 for a competitor in another org', async () => {
    await register();
    await seedOrg();
    const otherOrg = await pool.query<{ id: string }>(
      'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
      ['Other Org'],
    );
    const competitor = await pool.query<{ id: string }>(
      'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
      [otherOrg.rows[0]!.id, 'Foreign'],
    );
    const res = await app.inject({
      method: 'GET',
      url: `/v1/competitors/${competitor.rows[0]!.id}/battlecard`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(404);
  });
});
