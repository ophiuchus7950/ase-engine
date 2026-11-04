/**
 * Rivela ASE — competitors routes (schema 002).
 *
 *   POST   /v1/competitors         — add a competitor (+ optional website URLs,
 *                                    each creates a data_source so the engine
 *                                    actually starts monitoring it)
 *   GET    /v1/competitors         — profiles: name, signal count, sources
 *   PATCH  /v1/competitors/:id     — rename
 *   DELETE /v1/competitors/:id     — remove competitor (+ its sources/signals)
 *   GET    /v1/competitors/:id/battlecard — regenerable battlecard document
 *   POST   /v1/competitors/:id/battlecard/update — regenerate battlecard now
 *
 * Organization is taken from the authenticated session (requireUser); the
 * frontend logs in before managing competitors.
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import {
  CreateCompetitorBodySchema,
  IdParamsSchema,
  UpdateCompetitorBodySchema,
} from '../dto/schemas';
import { competitorProfileToWire, competitorToWire } from '../dto/mappers';
import { HttpError } from '../middleware/error-handler';
import { requireUser } from '../middleware/session';

const DEFAULT_REFRESH_MINUTES = 240;

export function registerCompetitorRoutes(app: FastifyInstance, repos: Repos): void {
  app.post('/competitors', async (request) => {
    const user = requireUser(request);
    const body = CreateCompetitorBodySchema.parse(request.body);
    const competitor = await repos.competitors.create(user.organizationId, body.name);
    // Each website URL becomes a monitored data_source so the collector
    // pipeline picks it up automatically ("anyone can customize competitors
    // and it should still work").
    for (const url of body.website_urls ?? []) {
      await repos.dataSources.create(user.organizationId, {
        competitorId: competitor.id,
        sourceType: 'competitor_website',
        targetUrl: url,
        collectionMethod: 'http_fetch',
        refreshIntervalMinutes: DEFAULT_REFRESH_MINUTES,
      });
    }
    return competitorToWire(competitor);
  });

  app.get('/competitors', async (request) => {
    const user = requireUser(request);
    const profiles = await repos.competitorProfiles.listProfiles(user.organizationId);
    return { items: profiles.map(competitorProfileToWire) };
  });

  app.patch('/competitors/:id', async (request) => {
    const user = requireUser(request);
    const { id } = IdParamsSchema.parse(request.params);
    const body = UpdateCompetitorBodySchema.parse(request.body);
    if (body.name === undefined) {
      throw new HttpError(400, 'bad_request', 'Nothing to update — provide name');
    }
    const competitor = await repos.competitors.getById(id);
    if (competitor === null || competitor.organizationId !== user.organizationId) {
      throw new HttpError(404, 'not_found', `Competitor ${id} not found`);
    }
    const updated = await repos.competitors.updateName(id, body.name);
    return competitorToWire(updated!);
  });

  app.delete('/competitors/:id', async (request) => {
    const user = requireUser(request);
    const { id } = IdParamsSchema.parse(request.params);
    const competitor = await repos.competitors.getById(id);
    if (competitor === null || competitor.organizationId !== user.organizationId) {
      throw new HttpError(404, 'not_found', `Competitor ${id} not found`);
    }
    await repos.competitors.remove(id);
    return { ok: true };
  });
}
