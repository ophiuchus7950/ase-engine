/**
 * Rivela ASE — session auth middleware (schema 002).
 *
 * OPTIONAL: attaches `request.user = { id, organizationId }` when a valid
 * `Authorization: Bearer <token>` header is present. Routes that need an
 * authenticated user call requireUser(request) themselves; all other /v1
 * routes stay protected by the shared X-API-Key (workers keep working).
 */
import type { FastifyRequest, onRequestHookHandler } from 'fastify';
import { config } from '../../config';
import { verifySessionToken } from '../auth/tokens';
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

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match === null ? null : (match[1] as string);
}

export const attachUser: onRequestHookHandler = async (request) => {
  const token = extractBearer(request);
  if (token === null) return;
  const payload = verifySessionToken(token, config.ASE_API_KEY);
  if (payload === null) return; // invalid/expired — treated as anonymous
  request.user = { id: payload.sub, organizationId: payload.org };
};

/** Route-level guard: throws 401 unless a valid session token was attached. */
export function requireUser(request: FastifyRequest): RequestUser {
  const { user } = request;
  if (user === undefined) {
    throw new HttpError(401, 'unauthorized', 'Missing or invalid session token');
  }
  return user;
}
