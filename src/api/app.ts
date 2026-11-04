/**
 * Rivela ASE — Fastify app factory (dependency-injected for tests).
 *
 * buildApp(repos, opts) returns a configured Fastify instance:
 *   - GET /health open (no auth)
 *   - every /v1/* route requires x-api-key (requireApiKey hook, prefix-scoped)
 *   - attachUser hook parses an optional Bearer session token (schema 002);
 *     user-scoped routes (competitors, rules, notifications, battlecards,
 *     auth) call requireUser() themselves
 *   - centralized error envelope via setErrorHandler / setNotFoundHandler
 *   - routes registered per ase_api_spec.md; static segments before /:id
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from '../config';
import type { Repos } from '../db/repo-types';
import { requireApiKey } from './middleware/auth';
import { makeErrorHandler, notFoundHandler } from './middleware/error-handler';
import { attachUser } from './middleware/session';
import { registerAlertRuleRoutes } from './routes/alert-rules.routes';
import { registerAuthRoutes } from './routes/auth.routes';
import { registerBattlecardReconcileRoutes } from './routes/battlecard-reconcile.routes';
import { registerBattlecardRoutes } from './routes/battlecards.routes';
import { registerCompetitorRoutes } from './routes/competitors.routes';
import { registerDataSourceRoutes } from './routes/data-sources.routes';
import { registerHealthRoutes } from './routes/health.routes';
import { registerNotificationRoutes } from './routes/notifications.routes';
import { registerRawSignalRoutes } from './routes/raw-signals.routes';
import { registerSignalRoutes } from './routes/signals.routes';
import { registerSlackSettingsRoutes } from './routes/slack-settings.routes';

export interface BuildAppOptions {
  /** X-API-Key value required on every /v1 request. Defaults to config.ASE_API_KEY. */
  apiKey?: string;
  /** Fastify logger. Default false so tests stay quiet. */
  logger?: boolean;
}

export function buildApp(repos: Repos, opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });
  const apiKey = opts.apiKey ?? config.ASE_API_KEY;

  app.setErrorHandler(makeErrorHandler(app.log));
  app.setNotFoundHandler(notFoundHandler);

  registerHealthRoutes(app);

  app.register(
    async (v1) => {
      v1.addHook('onRequest', requireApiKey(apiKey));
      v1.addHook('onRequest', attachUser);
      registerAuthRoutes(v1, repos);
      registerDataSourceRoutes(v1, repos);
      registerRawSignalRoutes(v1, repos);
      registerSignalRoutes(v1, repos);
      registerCompetitorRoutes(v1, repos);
      registerAlertRuleRoutes(v1, repos);
      registerNotificationRoutes(v1, repos);
      registerBattlecardRoutes(v1, repos);
      registerSlackSettingsRoutes(v1, repos);
      registerBattlecardReconcileRoutes(v1, repos);
    },
    { prefix: '/v1' },
  );

  return app;
}
