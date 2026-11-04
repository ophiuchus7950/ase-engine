/**
 * Rivela ASE — Fastify app factory (dependency-injected for tests).
 *
 * buildApp(repos, opts) returns a configured Fastify instance:
 *   - GET /health open
 *   - no auth: /v1 routes are resolved against the single local user
 *     (attachLocalUser hook); user-scoped routes call requireUser() to scope
 *     queries to the local organization
 *   - centralized error envelope via setErrorHandler / setNotFoundHandler
 *   - routes registered per ase_api_spec.md; static segments before /:id
 */
import Fastify, { type FastifyInstance } from 'fastify';
import type { Repos } from '../db/repo-types';
import { makeErrorHandler, notFoundHandler } from './middleware/error-handler';
import { attachLocalUser } from './middleware/session';
import { registerAlertRuleRoutes } from './routes/alert-rules.routes';
import { registerBattlecardReconcileRoutes } from './routes/battlecard-reconcile.routes';
import { registerBattlecardRoutes } from './routes/battlecards.routes';
import { registerCompetitorRoutes } from './routes/competitors.routes';
import { registerDataSourceRoutes } from './routes/data-sources.routes';
import { registerHealthRoutes } from './routes/health.routes';
import { registerMeRoutes } from './routes/me.routes';
import { registerNotificationRoutes } from './routes/notifications.routes';
import { registerRawSignalRoutes } from './routes/raw-signals.routes';
import { registerSignalRoutes } from './routes/signals.routes';

export interface BuildAppOptions {
  /** Fastify logger. Default false so tests stay quiet. */
  logger?: boolean;
}

export function buildApp(repos: Repos, opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  app.setErrorHandler(makeErrorHandler(app.log));
  app.setNotFoundHandler(notFoundHandler);

  registerHealthRoutes(app);

  app.register(
    async (v1) => {
      v1.addHook('onRequest', attachLocalUser(repos));
      registerMeRoutes(v1, repos);
      registerDataSourceRoutes(v1, repos);
      registerRawSignalRoutes(v1, repos);
      registerSignalRoutes(v1, repos);
      registerCompetitorRoutes(v1, repos);
      registerAlertRuleRoutes(v1, repos);
      registerNotificationRoutes(v1, repos);
      registerBattlecardRoutes(v1, repos);
      registerBattlecardReconcileRoutes(v1, repos);
    },
    { prefix: '/v1' },
  );

  return app;
}
