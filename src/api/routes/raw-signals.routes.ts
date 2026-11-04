/**
 * Rivela ASE — raw-signals routes (ase_api_spec.md §2).
 *
 * Append-only ingestion with server-side dedup on (competitor_id, content_hash):
 * POST returns 201 for new rows, 200 with the existing record on a dedup hit.
 * Static segment (/raw-signals/unclassified) registered before /raw-signals/:id.
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import {
  ClassifyBodySchema,
  IdParamsSchema,
  IngestRawSignalBodySchema,
  QueueQuerySchema,
  RawSignalIdParamsSchema,
  RawSignalsListQuerySchema,
} from '../dto/schemas';
import {
  classifyToDomain,
  ingestRawSignalToDomain,
  paginatedToWire,
  rawSignalToWire,
  signalToWire,
} from '../dto/mappers';
import { HttpError, findPgErrorCode } from '../middleware/error-handler';

export function registerRawSignalRoutes(app: FastifyInstance, repos: Repos): void {
  // POST /v1/raw-signals -> 201 (new) | 200 (dedup hit, existing row)
  app.post('/raw-signals', async (request, reply) => {
    const body = IngestRawSignalBodySchema.parse(request.body);
    const { signal, created } = await repos.rawSignals.ingest(ingestRawSignalToDomain(body));
    return reply.code(created ? 201 : 200).send(rawSignalToWire(signal));
  });

  // GET /v1/raw-signals/unclassified -> classification worker queue (before /:id)
  app.get('/raw-signals/unclassified', async (request) => {
    const query = QueueQuerySchema.parse(request.query);
    const items = await repos.rawSignals.listUnclassified(query.limit);
    return { items: items.map(rawSignalToWire) };
  });

  // GET /v1/raw-signals/:id
  app.get('/raw-signals/:id', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const signal = await repos.rawSignals.getById(id);
    if (!signal) throw new HttpError(404, 'not_found', `Raw signal ${id} not found`);
    return rawSignalToWire(signal);
  });

  // GET /v1/raw-signals -> paginated, filterable
  app.get('/raw-signals', async (request) => {
    const query = RawSignalsListQuerySchema.parse(request.query);
    const page = await repos.rawSignals.list(
      {
        competitorId: query.competitor_id,
        sourceType: query.source_type,
        collectedFrom: query.collected_from,
        collectedTo: query.collected_to,
      },
      { limit: query.limit, cursor: query.cursor ?? null },
    );
    return paginatedToWire(page, rawSignalToWire);
  });

  // POST /v1/raw-signals/:rawSignalId/classify -> 201 Signal (Stage 1)
  app.post('/raw-signals/:rawSignalId/classify', async (request, reply) => {
    const { rawSignalId } = RawSignalIdParamsSchema.parse(request.params);
    const body = ClassifyBodySchema.parse(request.body);
    const raw = await repos.rawSignals.getById(rawSignalId);
    if (!raw) throw new HttpError(404, 'not_found', `Raw signal ${rawSignalId} not found`);
    try {
      const signal = await repos.signals.createFromClassification(
        raw.id,
        raw.organizationId,
        raw.competitorId,
        classifyToDomain(body),
        new Date(),
      );
      return await reply.code(201).send(signalToWire(signal));
    } catch (err) {
      // raw_signal_id UNIQUE — a second classify on the same raw signal is a
      // conflict (the pg code may be wrapped in a typed repo error, hence the
      // cause-chain walk)
      if (findPgErrorCode(err) === '23505') {
        throw new HttpError(409, 'conflict', `Raw signal ${rawSignalId} already classified`);
      }
      throw err;
    }
  });
}
