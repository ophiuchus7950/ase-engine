import type { ApiError } from '../types/domain';

/**
 * Typed error for all internal-API failures: carries the HTTP status (null for
 * network-level failures) and the parsed {error, message} envelope when the
 * server returned a JSON error body (ase_api_spec.md — error format defaulted).
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly body: ApiError | null,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}
