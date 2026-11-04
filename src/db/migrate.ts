import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { closePool, pool } from './pool';

const SCHEMA_FILES = [
  new URL('../../db/ase_schema.sql', import.meta.url),
  new URL('../../db/ase_schema_002.sql', import.meta.url),
  new URL('../../db/ase_schema_003.sql', import.meta.url),
];

/**
 * Applies db/ase_schema.sql + db/ase_schema_002.sql to the configured database
 * via the shared pool. Tolerates re-runs: the base schema uses plain CREATE
 * (no IF NOT EXISTS), so a second apply fails with PostgreSQL "duplicate
 * object" errors — those are treated as "already applied" and are not fatal.
 * Schema 002 is written with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so it
 * re-applies cleanly on its own.
 */
export async function runMigration(): Promise<void> {
  for (const file of SCHEMA_FILES) {
    const sql = await readFile(file, 'utf8');
    try {
      await pool.query(sql);
      console.log(`[migrate] applied ${file.pathname.split('/').pop()}`);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      // duplicate_table 42P07 / duplicate_object 42710 / duplicate_function 42723
      if (code === '42P07' || code === '42710' || code === '42723') {
        console.log('[migrate] schema already applied (duplicate object ignored)');
        continue;
      }
      throw err;
    }
  }
}

export async function main(): Promise<void> {
  try {
    await runMigration();
    await closePool();
    process.exit(0);
  } catch (err) {
    console.error('[migrate] failed:', err);
    process.exit(1);
  }
}

// Auto-run only when this file is the entrypoint (tsx src/db/migrate.ts);
// importing it (tests, orchestrator, db/migrate.ts wrapper) is side-effect free.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
