/**
 * Rivela ASE — battlecard reconciliation endpoint (Workstream A, schema 003).
 *
 *   POST /v1/battlecards/reconcile?organization_id=<uuid>
 *
 * Worker/internal endpoint: regenerates every "stale" competitor battlecard
 * (a signal_card signal routed after the current battlecard, or none built yet)
 * under trigger='worker' and returns a simple count + the competitors touched.
 * Requires only the API key (no user session) — the reconciliation worker calls
 * it. When organization_id is omitted, the single seeded org is used.
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import { reconcileBattlecards } from '../../battlecard/service';
import { HttpError } from '../middleware/error-handler';
import { UuidSchema } from '../dto/schemas';

export function registerBattlecardReconcileRoutes(app: FastifyInstance, repos: Repos): void {
  app.post('/battlecards/reconcile', async (request) => {
    const query = request.query as { organization_id?: string };
    let organizationId = query.organization_id ?? null;
    if (organizationId !== null) {
      const parsed = UuidSchema.safeParse(organizationId);
      if (!parsed.success) {
        throw new HttpError(400, 'validation_error', 'Invalid organization_id');
      }
      organizationId = parsed.data;
    } else {
      organizationId = await repos.users.getDefaultOrganizationId();
      if (organizationId === null) {
        throw new HttpError(404, 'not_found', 'No organization found to reconcile');
      }
    }

    const result = await reconcileBattlecards(repos, organizationId);
    return {
      regenerated: result.regenerated,
      competitors: result.competitors.map((c) => ({
        competitor_id: c.competitorId,
        competitor_name: c.competitorName,
        version_id: c.versionId,
        error: c.error ?? null,
      })),
    };
  });
}
