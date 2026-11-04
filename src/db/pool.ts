import { Pool } from 'pg';

import { config } from '../config';

/**
 * Shared Postgres pool for the ASE engine. Constructed once from config.DATABASE_URL.
 * Every repo/worker receives it (or a test pool pointed at a dedicated test
 * database) via createRepos(pool) — see src/db/repos.ts.
 */
export const pool = new Pool({ connectionString: config.DATABASE_URL });

// Idle-client errors would otherwise crash the process (unhandled 'error' event).
pool.on('error', (err) => {
  console.error('[db] unexpected idle client error:', err);
});

/** Gracefully drains and closes the shared pool (used by migrate/seed runners and tests). */
export async function closePool(): Promise<void> {
  await pool.end();
}
