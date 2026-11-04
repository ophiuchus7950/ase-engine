/**
 * Rivela ASE — alert rules routes (schema 002).
 *
 *   POST   /v1/alert-rules   — create a rule
 *   GET    /v1/alert-rules   — list org rules
 *   PATCH  /v1/alert-rules/:id — update (rename, toggle, triggers, channels)
 *   DELETE /v1/alert-rules/:id — remove
 *
 * Rule evaluation happens at routing time (see src/pipeline/routing/evaluate-rules.ts):
 * a matching rule escalates routing (routing_override) and fires notifications
 * to its channels (webhook POST / email — recorded in the bell).
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import {
  CreateAlertRuleBodySchema,
  IdParamsSchema,
  UpdateAlertRuleBodySchema,
} from '../dto/schemas';
import { alertRuleToWire, createAlertRuleToDomain, updateAlertRuleToDomain } from '../dto/mappers';
import { HttpError } from '../middleware/error-handler';
import { requireUser } from '../middleware/session';

export function registerAlertRuleRoutes(app: FastifyInstance, repos: Repos): void {
  app.post('/alert-rules', async (request) => {
    const user = requireUser(request);
    const body = CreateAlertRuleBodySchema.parse(request.body);
    const rule = await repos.alertRules.create(user.organizationId, createAlertRuleToDomain(body));
    return alertRuleToWire(rule);
  });

  app.get('/alert-rules', async (request) => {
    const user = requireUser(request);
    const rules = await repos.alertRules.list(user.organizationId);
    return { items: rules.map(alertRuleToWire) };
  });

  app.patch('/alert-rules/:id', async (request) => {
    const user = requireUser(request);
    const { id } = IdParamsSchema.parse(request.params);
    const body = UpdateAlertRuleBodySchema.parse(request.body);
    const rule = await repos.alertRules.getById(id);
    if (rule === null || rule.organizationId !== user.organizationId) {
      throw new HttpError(404, 'not_found', `Alert rule ${id} not found`);
    }
    const updated = await repos.alertRules.update(id, updateAlertRuleToDomain(body));
    return alertRuleToWire(updated!);
  });

  app.delete('/alert-rules/:id', async (request) => {
    const user = requireUser(request);
    const { id } = IdParamsSchema.parse(request.params);
    const rule = await repos.alertRules.getById(id);
    if (rule === null || rule.organizationId !== user.organizationId) {
      throw new HttpError(404, 'not_found', `Alert rule ${id} not found`);
    }
    await repos.alertRules.remove(id);
    return { ok: true };
  });
}
