/**
 * Rivela ASE — local-user resolution (no-auth local mode).
 *
 * The engine is built to run on a personal machine: there is no login.
 * Every request is attributed to the single local user created by
 * `npm run seed` (or lazily on first request). User-scoped routes still call
 * requireUser() to scope their queries to the local organization.
 */
import type { FastifyRequest, onRequestHookHandler } from 'fastify';
import type { Repos } from '../../db/repo-types';
import { HttpError } from './error-handler';

export interface RequestUser {
  id: string;
  organizationId: string;
}

declare module 'fastify' {
  // Fastify module augmentation — the interface name intentionally matches the
  // imported type (standard Fastify pattern).
  // eslint-disable-next-line @typescript-eslint/no-shadow
  interface FastifyRequest {
    user?: RequestUser;
  }
}

/** Resolves the local user + org on every request. When the org is missing
 * (fresh database before `npm run seed`), the request proceeds unscoped —
 * user-scoped routes fail via requireUser(), worker routes keep working. */
export function attachLocalUser(repos: Repos): onRequestHookHandler {
  return async (request) => {
    const organizationId = await repos.users.getDefaultOrganizationId();
    if (organizationId === null) return;
    const existing = await repos.users.findByName('local');
    if (existing !== null) {
      request.user = { id: existing.id, organizationId: existing.organizationId };
      return;
    }
    const created = await repos.users.create(organizationId, 'local', '-');
    request.user = { id: created.id, organizationId: created.organizationId };
  };
}

/** Route-level helper: the resolved local user (guaranteed by the hook). */
export function requireUser(request: FastifyRequest): RequestUser {
  const { user } = request;
  if (user === undefined) {
    throw new HttpError(500, 'no_local_user', 'Local user not resolved');
  }
  return user;
}
