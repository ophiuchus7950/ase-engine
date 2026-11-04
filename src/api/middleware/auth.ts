/**
 * Rivela ASE — internal service auth.
 *
 * Every /v1/* route requires `x-api-key: <ASE_API_KEY>` (shared internal key
 * the workers send). GET /health is intentionally outside /v1 and stays open.
 */
import type { onRequestHookHandler } from 'fastify';
import { HttpError } from './error-handler';

export function requireApiKey(apiKey: string): onRequestHookHandler {
  return async (request) => {
    const header = request.headers['x-api-key'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (provided !== apiKey) {
      throw new HttpError(401, 'unauthorized', 'Missing or invalid X-API-Key header');
    }
  };
}
