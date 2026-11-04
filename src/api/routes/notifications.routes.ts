/**
 * Rivela ASE — notifications routes (schema 002, the bell).
 *
 *   GET  /v1/notifications          — recent notifications, newest first
 *   GET  /v1/notifications/unread-count — badge number for the bell
 *   POST /v1/notifications/:id/read — mark one as read
 *   POST /v1/notifications/read-all — mark everything read
 */
import type { FastifyInstance } from 'fastify';
import type { Repos } from '../../db/repo-types';
import { IdParamsSchema } from '../dto/schemas';
import { notificationToWire } from '../dto/mappers';
import { HttpError } from '../middleware/error-handler';
import { requireUser } from '../middleware/session';

export function registerNotificationRoutes(app: FastifyInstance, repos: Repos): void {
  app.get('/notifications', async (request) => {
    const user = requireUser(request);
    const limit = Number((request.query as { limit?: string }).limit ?? 50);
    const items = await repos.notifications.list(
      user.organizationId,
      Math.min(Math.max(limit, 1), 100),
    );
    return { items: items.map(notificationToWire) };
  });

  app.get('/notifications/unread-count', async (request) => {
    const user = requireUser(request);
    const count = await repos.notifications.countUnread(user.organizationId);
    return { count };
  });

  app.post('/notifications/:id/read', async (request) => {
    const { id } = IdParamsSchema.parse(request.params);
    const ok = await repos.notifications.markRead(id);
    if (!ok) throw new HttpError(404, 'not_found', `Notification ${id} not found`);
    return { ok: true };
  });

  app.post('/notifications/read-all', async (request) => {
    const user = requireUser(request);
    await repos.notifications.markAllRead(user.organizationId);
    return { ok: true };
  });
}
