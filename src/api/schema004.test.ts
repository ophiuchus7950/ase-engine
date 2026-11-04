/**
 * Rivela ASE — schema 003/004 Slack delivery-log integration tests (Workstream B).
 *
 * Covers against a real Postgres test database `ase_test_004`:
 *   (a) a `slack`-channel alert rule that matches a routed signal creates a
 *       notification carrying the delivery-log columns (channel_target, slack_ts,
 *       permalink, delivered_at, error);
 *   (b) `NotificationRepo.markDelivered` round-trips the delivery-log fields;
 *   (c) the PMM daily cap: after 3 delivered Slack Signal Cards today, the 4th
 *       matching signal_card is buffered to weekly_digest (notification status
 *       'failed', error 'daily_cap_reached', routing decision no longer signal_card).
 *
 * Run: npx vitest run src/api/schema004.test.ts
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRepos } from '../db/repos';
import type { Repos } from '../db/repo-types';
import { buildApp } from './app';
import type { NotificationWire, SignalDetailWire, SlackSettingsWire } from './dto/schemas';

const DB_USER = 'ase';
const DB_PASSWORD = 'ase_dev_pw';
const DB_HOST = 'localhost';
const DB_PORT = 5432;
const TEST_DB_NAME = 'ase_test_004';
const MAINTENANCE_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres`;
const TEST_DB_URL = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${TEST_DB_NAME}`;
const API_KEY = 'test-api-key';

const SCHEMA_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema.sql'), 'utf8');
const SCHEMA_002_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema_002.sql'), 'utf8');
const SCHEMA_003_SQL = readFileSync(resolve(process.cwd(), 'db/ase_schema_003.sql'), 'utf8');

let pool: Pool;
let app: FastifyInstance;
let repos: Repos;

beforeAll(async () => {
  const admin = new Pool({ connectionString: MAINTENANCE_URL });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await admin.end();

  pool = new Pool({ connectionString: TEST_DB_URL });
  await pool.query(SCHEMA_SQL);
  await pool.query(SCHEMA_002_SQL);
  await pool.query(SCHEMA_003_SQL);
  repos = createRepos(pool);
  app = buildApp(repos, { apiKey: API_KEY });
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

function authHeaders(token = ''): Record<string, string> {
  return {
    'x-api-key': API_KEY,
    'content-type': 'application/json',
    ...(token !== '' ? { authorization: `Bearer ${token}` } : {}),
  };
}

/** Register a real user session (needed for user-scoped /v1/notifications). */
async function registerSessionAndCompetitor(): Promise<{
  organizationId: string;
  competitorId: string;
  token: string;
}> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    ['Test Org'],
  );
  const organizationId = rows[0]!.id;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: authHeaders(),
    payload: { name: 'Test User', password: 'hunter2' },
  });
  expect(res.statusCode).toBe(200);
  const session = res.json<{ token: string }>();
  const comp = await pool.query<{ id: string }>(
    'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
    [organizationId, 'Acme'],
  );
  return { organizationId, competitorId: comp.rows[0]!.id, token: session.token };
}

async function seedOrgAndCompetitor(): Promise<{ organizationId: string; competitorId: string }> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    ['Test Org'],
  );
  const organizationId = rows[0]!.id;
  const comp = await pool.query<{ id: string }>(
    'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
    [organizationId, 'Acme'],
  );
  return { organizationId, competitorId: comp.rows[0]!.id };
}

/** A slack-channel rule with empty triggers matches any signal. */
async function createSlackRule(organizationId: string, target = '#ase-alerts'): Promise<string> {
  const rule = await repos.alertRules.create(organizationId, {
    name: 'Slack pricing watch',
    description: '',
    enabled: true,
    triggers: {},
    channels: [{ type: 'slack', target }],
    routingOverride: null,
  });
  return rule.id;
}

/**
 * Insert a signal_card-routed signal directly (bypassing the pipeline) so a
 * delivery-log notification can reference a signal that routes signal_card.
 * Returns the signal id.
 */
async function insertSignalCard(organizationId: string, competitorId: string): Promise<string> {
  const { rows: raw } = await pool.query<{ id: string }>(
    `INSERT INTO raw_signals
       (organization_id, competitor_id, source_type, raw_text, source_url, collection_method, collected_at, content_hash)
     VALUES ($1, $2, 'competitor_website', $3, 'https://acme.example.com/pricing', 'http_fetch', now(), $4)
     RETURNING id`,
    [organizationId, competitorId, 'Acme pricing move', randomUUID()],
  );
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO signals
       (raw_signal_id, organization_id, competitor_id, action_type, confidence_level, key_facts,
        classified_at, score_recency, score_source_authority, score_action_type, score_icp_relevance,
        score_deal_stage_context, score_novelty, significance_score, scored_at, routing_decision,
        battlecard_update_triggered, deal_alert_check_triggered, routed_at, bookmarked, created_at)
     VALUES ($1, $2, $3, 'pricing', 'high', $4::jsonb, now(),
             5, 5, 5, 5, 5, 5, 10, now(), 'signal_card',
             true, false, now(), false, now())
     RETURNING id`,
    [raw[0]!.id, organizationId, competitorId, JSON.stringify(['Acme pricing move'])],
  );
  return rows[0]!.id;
}

/** Full pipeline through route: routes to signal_card, high significance. */
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

// ---------------------------------------------------------------------------
// (a) Slack-channel rule creates a notification with delivery-log columns
// ---------------------------------------------------------------------------

describe('slack-channel alert rule + delivery-log columns', () => {
  it('routes a matching signal to a notification carrying channel_target + error', async () => {
    const { organizationId, competitorId } = await seedOrgAndCompetitor();
    const ruleId = await createSlackRule(organizationId);

    await routeSignalCard(organizationId, competitorId);

    const { rows } = await pool.query<{
      channel: string;
      status: string;
      channel_target: string;
      error: string | null;
      delivered_at: Date | null;
    }>(
      `SELECT channel, status, channel_target, error, delivered_at
       FROM notifications WHERE rule_id = $1`,
      [ruleId],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.channel).toBe('slack');
    expect(row.channel_target).toBe('#ase-alerts');
    // Slack is unconfigured in tests, so the push degrades to a recorded failure.
    expect(row.status).toBe('failed');
    expect(row.error).toBe('slack_not_configured');
    expect(row.delivered_at).not.toBeNull();
  });

  it('exposes the delivery-log fields on the wire (GET /v1/notifications)', async () => {
    const { organizationId, competitorId, token } = await registerSessionAndCompetitor();
    const ruleId = await createSlackRule(organizationId);
    await routeSignalCard(organizationId, competitorId);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/notifications',
      headers: authHeaders(token),
    });
    expect(res.statusCode).toBe(200);
    const { items } = res.json<{ items: NotificationWire[] }>();
    const n = items.find((item) => item.rule_id === ruleId);
    expect(n).toBeDefined();
    expect(n!.channel_target).toBe('#ase-alerts');
    expect(n!.slack_ts).toBe('');
    expect(n!.error).toBe('slack_not_configured');
  });
});

// ---------------------------------------------------------------------------
// (b) markDelivered round-trip
// ---------------------------------------------------------------------------

describe('NotificationRepo.markDelivered round-trip', () => {
  it('updates slack_ts/permalink/delivered_at/status and lists them back', async () => {
    const { organizationId } = await seedOrgAndCompetitor();
    const created = await repos.notifications.create({
      organizationId,
      signalId: null,
      ruleId: null,
      title: 'Alert',
      body: 'body',
      channel: 'slack',
      status: 'pending',
      channelTarget: '#ase-alerts',
    });

    await repos.notifications.markDelivered(created.id, {
      slackTs: '1700000000.000100',
      permalink: 'https://fake.slack.com/archives/C123/p1',
      deliveredAt: '2026-08-05T12:00:00.000Z',
      status: 'delivered',
      error: null,
    });

    const [listed] = await repos.notifications.list(organizationId, 10);
    expect(listed!.status).toBe('delivered');
    expect(listed!.slackTs).toBe('1700000000.000100');
    expect(listed!.permalink).toBe('https://fake.slack.com/archives/C123/p1');
    expect(listed!.deliveredAt).toBe('2026-08-05T12:00:00.000Z');
    expect(listed!.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (c) PMM daily cap — buffer the 4th Slack Signal Card to weekly_digest
// ---------------------------------------------------------------------------

describe('PMM daily cap (3 Slack Signal Cards / day)', () => {
  it('suppresses the 4th Slack push without demoting the signal from signal_card', async () => {
    const { organizationId, competitorId } = await seedOrgAndCompetitor();
    const ruleId = await createSlackRule(organizationId);

    // Seed 3 delivered Slack Signal Cards for today (already pushed + counted).
    // Each must reference a signal routed signal_card so the cap counts it.
    const now = new Date().toISOString();
    for (let i = 0; i < 3; i += 1) {
      const signalId = await insertSignalCard(organizationId, competitorId);
      await repos.notifications.create({
        organizationId,
        signalId,
        ruleId: null,
        title: `Delivered ${i}`,
        body: 'body',
        channel: 'slack',
        status: 'delivered',
        channelTarget: '#ase-alerts',
        deliveredAt: now,
      });
    }

    // The 4th signal_card on a slack rule hits the cap: the Slack push is
    // suppressed, but the signal must STAY signal_card (its high-priority
    // classification and the battlecard update must not be destroyed).
    const detail = await routeSignalCard(organizationId, competitorId);
    expect(detail.routing_decision).toBe('signal_card');

    // The persisted routing decision must remain signal_card.
    const { rows: signalRows } = await pool.query<{ routing_decision: string }>(
      'SELECT routing_decision FROM signals WHERE id = $1',
      [detail.id],
    );
    expect(signalRows[0]!.routing_decision).toBe('signal_card');

    // Because it stayed signal_card, the in-process battlecard trigger fired and
    // the competitor's battlecard is current (not starved by the cap).
    const battlecard = await pool.query<{ competitor_id: string }>(
      'SELECT competitor_id FROM battlecards WHERE competitor_id = $1',
      [competitorId],
    );
    expect(battlecard.rows).toHaveLength(1);

    // The suppressed delivery is recorded (failed, daily_cap_reached) and it is
    // NOT an outbound signal_card delivery.
    const { rows } = await pool.query<{
      channel: string;
      status: string;
      error: string | null;
    }>(`SELECT channel, status, error FROM notifications WHERE rule_id = $1`, [ruleId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.channel).toBe('slack');
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.error).toBe('daily_cap_reached');

    // countDeliveredForOrgToday still reflects only the 3 delivered.
    const count = await repos.notifications.countDeliveredForOrgToday(organizationId, new Date());
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// (d) Runtime Slack settings API — save tokens + masked-on-read
// ---------------------------------------------------------------------------

describe('runtime Slack settings API', () => {
  it('GET returns unconfigured when no row; PUT saves; GET masks tokens', async () => {
    const { token } = await registerSessionAndCompetitor();

    const before = await app.inject({
      method: 'GET',
      url: '/v1/settings/slack',
      headers: authHeaders(token),
    });
    expect(before.statusCode).toBe(200);
    expect(before.json<SlackSettingsWire>().configured).toBe(false);

    const put = await app.inject({
      method: 'PUT',
      url: '/v1/settings/slack',
      headers: authHeaders(token),
      payload: {
        bot_token: 'xoxb-secret-1234',
        app_token: 'xapp-secret-5678',
        signing_secret: 'sig-abc',
        default_channel: '#alerts',
        web_app_url: 'http://localhost:5173',
      },
    });
    expect(put.statusCode).toBe(200);
    const saved = put.json<SlackSettingsWire>();
    expect(saved.configured).toBe(true);
    expect(saved.bot_token_masked).toBe('••••1234');
    // The full token must never be returned.
    expect(JSON.stringify(saved)).not.toContain('xoxb-secret-1234');

    const after = await app.inject({
      method: 'GET',
      url: '/v1/settings/slack',
      headers: authHeaders(token),
    });
    const got = after.json<SlackSettingsWire>();
    expect(got.configured).toBe(true);
    expect(got.bot_token_masked).toBe('••••1234');
    expect(got.default_channel).toBe('#alerts');
    expect(JSON.stringify(got)).not.toContain('xoxb-secret-1234');
  });
});
