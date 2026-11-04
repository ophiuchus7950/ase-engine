/**
 * Rivela ASE — signals routes (ase_api_spec.md §3).
 *
 * Stage 2 (scoring) and Stage 3 (routing) lifecycle + worker queues. Static
 * segments (pending-scoring, pending-routing, routed) are registered before
 * the parameterized /signals/:id route.
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import {
  BookmarkBodySchema,
  IdParamsSchema,
  QueueQuerySchema,
  RouteBodySchema,
  RoutedQuerySchema,
  ScoreBodySchema,
  SignalsListQuerySchema,
} from '../dto/schemas';
import {
  paginatedToWire,
  routeToDomain,
  scoreToDomain,
  signalDetailToWire,
  signalToWire,
} from '../dto/mappers';
import { HttpError } from '../middleware/error-handler';
import { evaluateRules } from '../../pipeline/routing/evaluate-rules';
import { regenerateBattlecard } from '../../battlecard/service';

export function registerSignalRoutes(app: FastifyInstance, repos: Repos): void {
  // GET /v1/signals/pending-scoring -> scoring worker queue (before /:id)
  app.get('/signals/pending-scoring', async (request) => {
    const query = QueueQuerySchema.parse(request.query);
    const items = await repos.signals.listPendingScoring(query.limit);
    return { items: items.map(signalToWire) };
  });

  // GET /v1/signals/pending-routing -> routing engine queue (before /:id)
  app.get('/signals/pending-routing', async (request) => {
    const query = QueueQuerySchema.parse(request.query);
    const items = await repos.signals.listPendingRouting(query.limit);
    return { items: items.map(signalToWire) };
  });

  // GET /v1/signals/routed?routing_decision=... -> downstream consumer queue
  app.get('/signals/routed', async (request) => {
    const query = RoutedQuerySchema.parse(request.query);
    const items = await repos.signals.listRouted(query.routing_decision, query.limit);
    return { items: items.map(signalDetailToWire) };
  });

  // GET /v1/signals/:id -> SignalDetail (joined with raw signal + competitor)
  app.get('/signals/:id', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const signal = await repos.signals.getById(id);
    if (!signal) throw new HttpError(404, 'not_found', `Signal ${id} not found`);
    return signalDetailToWire(signal);
  });

  // GET /v1/signals -> paginated, filterable
  app.get('/signals', async (request) => {
    const query = SignalsListQuerySchema.parse(request.query);
    const page = await repos.signals.list(
      {
        organizationId: query.organization_id,
        competitorId: query.competitor_id,
        actionType: query.action_type,
        routingDecision: query.routing_decision,
        minSignificance: query.min_significance,
        maxSignificance: query.max_significance,
        classifiedFrom: query.classified_from,
        classifiedTo: query.classified_to,
        routedFrom: query.routed_from,
        routedTo: query.routed_to,
        bookmarked: query.bookmarked,
        search: query.search,
      },
      { limit: query.limit, cursor: query.cursor ?? null },
    );
    return paginatedToWire(page, signalDetailToWire);
  });

  // POST /v1/signals/:id/bookmark -> toggle the user bookmark flag
  app.post('/signals/:id/bookmark', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = BookmarkBodySchema.parse(request.body);
    const signal = await repos.signals.setBookmarked(id, body.bookmarked, new Date());
    if (!signal) throw new HttpError(404, 'not_found', `Signal ${id} not found`);
    return signalToWire(signal);
  });

  // POST /v1/signals/:id/score -> Stage 2 (repo sums factors + clamps 1..10)
  app.post('/signals/:id/score', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = ScoreBodySchema.parse(request.body);
    const signal = await repos.signals.updateScore(id, scoreToDomain(body), new Date());
    if (!signal) throw new HttpError(404, 'not_found', `Signal ${id} not found`);
    return signalToWire(signal);
  });

  // POST /v1/signals/:id/route -> Stage 3 routing outcome
  app.post('/signals/:id/route', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = RouteBodySchema.parse(request.body);
    const signal = await repos.signals.updateRouting(id, routeToDomain(body), new Date());
    if (!signal) throw new HttpError(404, 'not_found', `Signal ${id} not found`);
    // Rule evaluation (schema 002): matching rules escalate routing and fire
    // notifications. Needs the joined detail (raw text for keyword matching).
    // Trustworthy routing first: rule/notification delivery is best-effort and
    // must never fail the route response once routing has been persisted above.
    const detail = await repos.signals.getById(id);
    if (detail !== null) {
      try {
        await evaluateRules(repos, detail.organizationId, detail);
      } catch (err) {
        request.log.error(
          { err, signalId: id },
          'rule evaluation failed after routing (routing already persisted)',
        );
      }
      // Battlecard automation (Workstream A): rule evaluation may have escalated
      // the routing decision, so re-fetch to read the FINAL state. If it routed
      // to signal_card, keep the battlecard current in-process. A regen failure
      // must never fail the route response — log it and move on.
      try {
        const finalDetail = await repos.signals.getById(id);
        if (finalDetail !== null && finalDetail.routingDecision === 'signal_card') {
          await regenerateBattlecard(
            repos,
            finalDetail.competitorId,
            finalDetail.organizationId,
            'routing',
            finalDetail.id,
          );
        }
      } catch (err) {
        request.log.error({ err, signalId: id }, 'battlecard regeneration failed after routing');
      }
    }
    return signalToWire(signal);
  });
}
