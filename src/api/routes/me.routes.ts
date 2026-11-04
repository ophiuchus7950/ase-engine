/**
 * Rivela ASE — local identity route (no-auth local mode).
 *
 *   GET /v1/me — the local user + organization, used by the web app to learn
 *   the org id (replaces the old /v1/auth/* endpoints).
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import { requireUser } from '../middleware/session';

export function registerMeRoutes(app: FastifyInstance, repos: Repos): void {
  app.get('/me', async (request) => {
    const session = requireUser(request);
    const user = await repos.users.findById(session.id);
    if (user === null) {
      return {
        user: { id: session.id, organization_id: session.organizationId, name: 'local' },
      };
    }
    return {
      user: { id: user.id, organization_id: user.organizationId, name: user.name },
    };
  });
}
