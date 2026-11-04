/**
 * Rivela ASE — HTTP API entrypoint.
 *
 * Loads config, builds the repo layer over a pg Pool, builds the Fastify app,
 * and listens on config.PORT with graceful shutdown on SIGINT/SIGTERM.
 */
import { Pool } from 'pg';
import { config } from '../config';
import { createRepos } from '../db/repos';
import { buildApp } from './app';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const app = buildApp(createRepos(pool), { logger: true });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await pool.end();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    await pool.end();
    process.exit(1);
  }
}

main();
