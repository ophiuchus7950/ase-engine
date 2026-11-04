/**
 * Rivela ASE — centralized error handling (ase_api_spec.md "error envelope").
 *
 * Every response on failure is { error: <machine code>, message: <detail> }:
 *   - zod validation failures  -> 400 validation_error
 *   - HttpError (routes throw) -> its statusCode / code (401, 404, 409, ...)
 *   - Fastify parse errors     -> 400 validation_error
 *   - Postgres unique conflict -> 409 conflict
 *   - anything else            -> 500 internal_error (real error logged)
 */
import { ZodError } from 'zod';
import type { FastifyBaseLogger, FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/** Typed HTTP error thrown by route handlers; rendered by the error handler. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Minimal shape of a node-postgres error (code = '23505' unique_violation, ...). */
export interface PgError extends Error {
  code?: string;
}

export function isPgError(error: unknown): error is PgError {
  return error instanceof Error && typeof (error as PgError).code === 'string';
}

/**
 * Walks an Error's `cause` chain looking for a node-postgres error code
 * (e.g. '23505' unique_violation). Repos wrap db failures in typed errors
 * (standards §6: src/db/repos.ts RepoError keeps the pg error as `cause`),
 * so the raw code can be one or more layers down.
 */
export function findPgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    if (isPgError(current)) return current.code;
    current = current.cause;
  }
  return undefined;
}

function zodMessage(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

export function makeErrorHandler(logger: FastifyBaseLogger) {
  return async function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'validation_error', message: zodMessage(error) });
    }
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (typeof error.code === 'string' && error.code.startsWith('FST_ERR_')) {
      // Fastify-level parse errors: malformed JSON body, wrong content-type, ...
      return reply.code(400).send({ error: 'validation_error', message: error.message });
    }
    if (findPgErrorCode(error) === '23505') {
      return reply.code(409).send({ error: 'conflict', message: 'Resource already exists' });
    }
    logger.error({ err: error, url: request.url }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error', message: 'Internal server error' });
  };
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply
    .code(404)
    .send({ error: 'not_found', message: `Route ${request.method} ${request.url} not found` });
}
