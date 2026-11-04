import { readFile } from 'node:fs/promises';

import { Client, Pool } from 'pg';

import { config } from '../config';
import type { ClassifyRequest, IngestRawSignalRequest } from '../types/domain';
import type { Repos } from './repo-types';
import { createRepos } from './repos';

/**
 * Integration-test helpers (not part of the runtime surface).
 *
 * Tests run against a dedicated 'ase_test' database, derived from the
 * configured DATABASE_URL by swapping the database name, so the dev 'ase'
 * database is never touched.
 */

export const TEST_DB_NAME = 'ase_test';

export const TEST_DATABASE_URL = config.DATABASE_URL.replace(/\/[^/]*$/, `/${TEST_DB_NAME}`);

const SCHEMA_URL = new URL('../../db/ase_schema.sql', import.meta.url);
const SCHEMA_002_URL = new URL('../../db/ase_schema_002.sql', import.meta.url);
const SCHEMA_003_URL = new URL('../../db/ase_schema_003.sql', import.meta.url);

/** Drops every schema object, making applyTestSchema() idempotent. */
const DROP_OBJECTS_SQL = `
  DROP TABLE IF EXISTS notifications, alert_rules, battlecards, battlecard_versions, users,
    signals, raw_signals, data_sources, competitors, organizations CASCADE;
  DROP TYPE IF EXISTS source_type, action_type, confidence_level, routing_decision CASCADE;
  DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
`;

export const TRUNCATE_SQL =
  'TRUNCATE organizations, competitors, data_sources, raw_signals, signals, ' +
  'users, alert_rules, notifications, battlecards, battlecard_versions ' +
  'RESTART IDENTITY CASCADE';

function isDuplicateDatabase(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '42P04'
  );
}

/** Creates ase_test if it does not exist (connects to the maintenance 'postgres' DB). */
export async function ensureTestDatabase(): Promise<void> {
  const maintenanceUrl = config.DATABASE_URL.replace(/\/[^/]*$/, '/postgres');
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } catch (err) {
    if (!isDuplicateDatabase(err)) throw err;
  } finally {
    await client.end();
  }
}

/** Fresh pool bound to ase_test; verifies connectivity with SELECT 1. */
export async function createTestPool(): Promise<Pool> {
  const testPool = new Pool({ connectionString: TEST_DATABASE_URL });
  await testPool.query('SELECT 1');
  return testPool;
}

/** Drops and recreates all schema objects in ase_test (idempotent). */
export async function applyTestSchema(pool: Pool): Promise<void> {
  const sql = await readFile(SCHEMA_URL, 'utf8');
  const sql002 = await readFile(SCHEMA_002_URL, 'utf8');
  const sql003 = await readFile(SCHEMA_003_URL, 'utf8');
  await pool.query(`${DROP_OBJECTS_SQL}\n${sql}\n${sql002}\n${sql003}`);
}

export async function resetTestDb(pool: Pool): Promise<void> {
  await pool.query(TRUNCATE_SQL);
}

export async function insertOrganization(pool: Pool, name = 'Test Org'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
    [name],
  );
  return rows[0]!.id;
}

export async function insertCompetitor(
  pool: Pool,
  organizationId: string,
  name: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO competitors (organization_id, name) VALUES ($1, $2) RETURNING id',
    [organizationId, name],
  );
  return rows[0]!.id;
}

export function createTestRepos(pool: Pool): Repos {
  return createRepos(pool);
}

// ---------------------------------------------------------------------------
// Request fixtures
// ---------------------------------------------------------------------------

export function ingestRequest(
  organizationId: string,
  competitorId: string,
  overrides: Partial<IngestRawSignalRequest> = {},
): IngestRawSignalRequest {
  return {
    organizationId,
    competitorId,
    dataSourceId: null,
    sourceType: 'competitor_website',
    rawText: 'Globex raised prices on the Enterprise plan.',
    sourceUrl: 'https://globex.example.com/pricing',
    collectionMethod: 'http_fetch',
    collectedAt: '2026-07-30T10:00:00.000Z',
    contentHash: 'hash-1',
    ...overrides,
  };
}

export function classifyRequest(overrides: Partial<ClassifyRequest> = {}): ClassifyRequest {
  return {
    actionType: 'pricing',
    confidenceLevel: 'high',
    keyFacts: [
      'Enterprise plan now $99 per user per month, up from $79',
      'Annual billing discount removed',
    ],
    llmModelUsed: 'opencode/deepseek-v4-flash-free',
    ...overrides,
  };
}
