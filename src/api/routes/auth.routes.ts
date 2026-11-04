/**
 * Rivela ASE — auth routes (schema 002, single-user MVP).
 *
 *   POST /v1/auth/register — first-run setup: allowed ONLY while no users
 *       exist (single-user product). Creates the account and returns a token.
 *   POST /v1/auth/login     — name + password -> { token, user }
 *   GET  /v1/auth/me        — current session user (requires Bearer token)
 *
 * All routes sit under /v1 so they also need X-API-Key (the web app sends
 * both headers). Tokens are HMAC-signed via src/api/auth/tokens.ts.
 */
import type { FastifyInstance } from 'fastify';
import { config } from '../../config';
import type { Repos } from '../../db/repo-types';
import { hashPassword, verifyPassword } from '../auth/password';
import { createSessionToken } from '../auth/tokens';
import { LoginBodySchema, RegisterBodySchema } from '../dto/schemas';
import { HttpError } from '../middleware/error-handler';
import { requireUser } from '../middleware/session';

export function registerAuthRoutes(app: FastifyInstance, repos: Repos): void {
  // First-run registration — only valid while the users table is empty.
  app.post('/auth/register', async (request) => {
    const body = RegisterBodySchema.parse(request.body);
    const existing = await repos.users.count();
    if (existing > 0) {
      throw new HttpError(
        403,
        'registration_closed',
        'Registration is closed — an account already exists',
      );
    }
    const existingUser = await repos.users.findByName(body.name);
    if (existingUser !== null) {
      throw new HttpError(409, 'name_taken', `User "${body.name}" already exists`);
    }
    const organizationId = await repos.users.getDefaultOrganizationId();
    if (organizationId === null) {
      throw new HttpError(
        500,
        'no_organization',
        'No organization exists — run the seed data first',
      );
    }
    const user = await repos.users.create(organizationId, body.name, hashPassword(body.password));
    const token = createSessionToken(user.id, user.organizationId, config.ASE_API_KEY);
    return { token, user: { id: user.id, organization_id: user.organizationId, name: user.name } };
  });

  app.post('/auth/login', async (request) => {
    const body = LoginBodySchema.parse(request.body);
    const user = await repos.users.findByName(body.name);
    // Same error for unknown user vs wrong password (no account enumeration).
    if (user === null || !verifyPassword(body.password, user.passwordHash)) {
      throw new HttpError(401, 'invalid_credentials', 'Invalid name or password');
    }
    const token = createSessionToken(user.id, user.organizationId, config.ASE_API_KEY);
    return {
      token,
      user: { id: user.id, organization_id: user.organizationId, name: user.name },
    };
  });

  app.get('/auth/me', async (request) => {
    const session = requireUser(request);
    const user = await repos.users.findById(session.id);
    if (user === null) {
      throw new HttpError(401, 'invalid_credentials', 'Session user no longer exists');
    }
    return {
      user: { id: user.id, organization_id: user.organizationId, name: user.name },
    };
  });
}
