/**
 * Rivela ASE — battlecards routes (schema 002/003).
 *
 *   GET  /v1/competitors/:id/battlecard              — current battlecard
 *       (generated on first access via the shared builder)
 *   GET  /v1/competitors/:id/battlecard/history      — append-only regeneration
 *       history (schema 003), newest-first
 *   POST /v1/competitors/:id/battlecard/update       — regenerate NOW (trigger
 *       'manual'); also appends a history version. This is what the "Update
 *       Battlecard" button calls.
 *
 * The battlecard is a deterministic document derived from the competitor's
 * signal_card-routed signals, built by src/battlecard/build.ts and applied via
 * src/battlecard/service.ts (shared with the routing-time trigger + reconcile
 * worker). No LLM call — instant, honest, and testable.
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import { regenerateBattlecard } from '../../battlecard/service';
import { buildBattlecardContent } from '../../battlecard/build';
import { IdParamsSchema, PaginationQuerySchema } from '../dto/schemas';
import { battlecardToWire, battlecardVersionToWire, paginatedToWire } from '../dto/mappers';
import { HttpError } from '../middleware/error-handler';
import { requireUser } from '../middleware/session';

export function registerBattlecardRoutes(app: FastifyInstance, repos: Repos): void {
  const loadSignals = (competitorId: string, organizationId: string) =>
    repos.signals.list(
      {
        organizationId,
        competitorId,
        routingDecision: 'signal_card',
        minSignificance: 7,
      },
      { limit: 50, cursor: null },
    );

  const assertCompetitor = async (id: string, organizationId: string) => {
    const competitor = await repos.competitors.getById(id);
    if (competitor === null || competitor.organizationId !== organizationId) {
      throw new HttpError(404, 'not_found', `Competitor ${id} not found`);
    }
    return competitor;
  };

  const getOrBuild = async (
    competitorId: string,
    organizationId: string,
    competitorName: string,
    regenerate: boolean,
  ) => {
    if (!regenerate) {
      const existing = await repos.battlecards.getByCompetitor(competitorId);
      if (existing !== null) return existing;
    }
    const page = await loadSignals(competitorId, organizationId);
    const content = buildBattlecardContent(competitorName, page.items);
    return repos.battlecards.upsert(competitorId, content, new Date());
  };

  app.get('/competitors/:id/battlecard', async (request) => {
    const user = requireUser(request);
    const { id } = IdParamsSchema.parse(request.params);
    const competitor = await assertCompetitor(id, user.organizationId);
    const battlecard = await getOrBuild(id, user.organizationId, competitor.name, false);
    return battlecardToWire(battlecard, competitor.name);
  });

  app.get('/competitors/:id/battlecard/history', async (request) => {
    const user = requireUser(request);
    const { id } = IdParamsSchema.parse(request.params);
    await assertCompetitor(id, user.organizationId);
    const query = PaginationQuerySchema.parse(request.query);
    const page = await repos.battlecards.listVersions(id, {
      limit: query.limit,
      cursor: query.cursor ?? null,
    });
    return paginatedToWire(page, battlecardVersionToWire);
  });

  app.post('/competitors/:id/battlecard/update', async (request) => {
    const user = requireUser(request);
    const { id } = IdParamsSchema.parse(request.params);
    const competitor = await assertCompetitor(id, user.organizationId);
    const { battlecard } = await regenerateBattlecard(
      repos,
      id,
      user.organizationId,
      'manual',
      null,
    );
    return battlecardToWire(battlecard, competitor.name);
  });
}
