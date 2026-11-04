/**
 * Rivela ASE — data-sources routes (ase_api_spec.md §1).
 *
 * Static segments (/data-sources/due) are registered before the parameterized
 * /data-sources/:id route. All bodies/queries/params zod-validated at the
 * boundary (standards §5); snake_case wire kept end to end (standards §2).
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import {
  DataSourcesListQuerySchema,
  CreateDataSourceBodySchema,
  IdParamsSchema,
  OrganizationIdParamsSchema,
  UpdateDataSourceBodySchema,
} from '../dto/schemas';
import {
  createDataSourceToDomain,
  dataSourceToWire,
  paginatedToWire,
  updateDataSourceToDomain,
} from '../dto/mappers';
import { HttpError } from '../middleware/error-handler';

export function registerDataSourceRoutes(app: FastifyInstance, repos: Repos): void {
  // POST /v1/organizations/:organizationId/data-sources -> 201 DataSource
  app.post('/organizations/:organizationId/data-sources', async (request, reply) => {
    const { organizationId } = OrganizationIdParamsSchema.parse(request.params);
    const body = CreateDataSourceBodySchema.parse(request.body);
    const dataSource = await repos.dataSources.create(
      organizationId,
      createDataSourceToDomain(body),
    );
    return reply.code(201).send(dataSourceToWire(dataSource));
  });

  // GET /v1/organizations/:organizationId/data-sources -> paginated
  app.get('/organizations/:organizationId/data-sources', async (request) => {
    const { organizationId } = OrganizationIdParamsSchema.parse(request.params);
    const query = DataSourcesListQuerySchema.parse(request.query);
    const page = await repos.dataSources.list(
      organizationId,
      {
        competitorId: query.competitor_id,
        sourceType: query.source_type,
        isActive: query.is_active,
      },
      { limit: query.limit, cursor: query.cursor ?? null },
    );
    return paginatedToWire(page, dataSourceToWire);
  });

  // GET /v1/data-sources/due -> scheduler queue (registered before /:id)
  app.get('/data-sources/due', async () => {
    const due = await repos.dataSources.listDue(new Date());
    return { items: due.map(dataSourceToWire) };
  });

  // GET /v1/data-sources/:id
  app.get('/data-sources/:id', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const dataSource = await repos.dataSources.getById(id);
    if (!dataSource) throw new HttpError(404, 'not_found', `Data source ${id} not found`);
    return dataSourceToWire(dataSource);
  });

  // PATCH /v1/data-sources/:id
  app.patch('/data-sources/:id', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const body = UpdateDataSourceBodySchema.parse(request.body);
    const updated = await repos.dataSources.update(id, updateDataSourceToDomain(body));
    if (!updated) throw new HttpError(404, 'not_found', `Data source ${id} not found`);
    return dataSourceToWire(updated);
  });

  // DELETE /v1/data-sources/:id -> 204 (soft remove, repo sets is_active = false)
  app.delete('/data-sources/:id', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const removed = await repos.dataSources.remove(id);
    if (!removed) throw new HttpError(404, 'not_found', `Data source ${id} not found`);
    return reply.code(204).send();
  });

  // POST /v1/data-sources/:id/mark-collected -> 204
  app.post('/data-sources/:id/mark-collected', async (request, reply) => {
    const { id } = IdParamsSchema.parse(request.params);
    const existing = await repos.dataSources.getById(id);
    if (!existing) throw new HttpError(404, 'not_found', `Data source ${id} not found`);
    await repos.dataSources.markCollected(id, new Date());
    return reply.code(204).send();
  });
}
