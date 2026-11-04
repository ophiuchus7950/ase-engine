import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { closePool, pool } from './pool';

const SEED_FILE = new URL('../../db/seed.sql', import.meta.url);

/** Applies db/seed.sql (idempotent dev seed) to the configured database. */
export async function runSeed(): Promise<void> {
  const sql = await readFile(SEED_FILE, 'utf8');
  await pool.query(sql);
  console.log('[seed] applied db/seed.sql');
}

export async function main(): Promise<void> {
  try {
    await runSeed();
    await closePool();
    process.exit(0);
  } catch (err) {
    console.error('[seed] failed:', err);
    process.exit(1);
  }
}

// Auto-run only when this file is the entrypoint (tsx src/db/seed.ts);
// importing it (tests, orchestrator, db/seed.ts wrapper) is side-effect free.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}
