/**
 * Rivela ASE — health endpoint. Open (no auth): workers and orchestrators use
 * it to confirm the API is up before starting their poll loops.
 */
import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({ status: 'ok' }));
}
