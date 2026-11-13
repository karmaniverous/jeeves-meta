/**
 * @module toMetaError
 * The one mapping from what jeeves' catalog client throws to {@link MetaError} (Decision 186): a response keeps its HTTP status, its body's `code` (else `http_<status>`) and its body's `message`; client-side failures get the SDK's own codes and status 0. Pure.
 */

import { CatalogClientError } from '@karmaniverous/jeeves/catalog';

import { MetaError } from './MetaError.js';

/**
 * The SDK code of a failure that produced no usable response.
 *
 * @param cause - The underlying error.
 * @returns `timeout`, `invalid_response` (a 2xx body that is not JSON) or `network_error`.
 */
function noResponseCode(
  cause: unknown,
): 'timeout' | 'invalid_response' | 'network_error' {
  if (cause instanceof Error && cause.name === 'TimeoutError') return 'timeout';
  if (cause instanceof SyntaxError) return 'invalid_response';
  return 'network_error';
}

/**
 * Message of an underlying error.
 *
 * @param cause - Anything thrown.
 * @returns Its message, or its string form.
 */
const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * A string field of an error body, treating empty as absent.
 *
 * @param value - The field.
 * @returns It, or `undefined` when missing or empty.
 */
const nonEmpty = (value: string | undefined): string | undefined =>
  value === '' ? undefined : value;

/**
 * Convert a failed catalog call to a {@link MetaError}.
 *
 * @param error - What the catalog client threw.
 * @param operation - Catalog entry name (used in messages).
 * @param timeoutMs - The call's timeout (used in the timeout message).
 * @param responseText - The non-2xx body as received, when captured.
 * @returns The error to throw.
 */
export function toMetaError(
  error: unknown,
  operation: string,
  timeoutMs: number,
  responseText?: string,
): MetaError {
  if (!(error instanceof CatalogClientError)) {
    return new MetaError({
      code: 'network_error',
      status: 0,
      message: `${operation} request failed: ${messageOf(error)}`,
      cause: error,
    });
  }
  if (error.status >= 300) {
    return new MetaError({
      code: nonEmpty(error.code) ?? `http_${String(error.status)}`,
      status: error.status,
      message:
        nonEmpty(error.body?.message) ??
        nonEmpty(error.body?.error) ??
        `HTTP ${String(error.status)}`,
      ...(error.body === undefined ? {} : { body: error.body }),
      ...(responseText === undefined ? {} : { responseText }),
      cause: error,
    });
  }
  if (error.issues !== undefined) {
    const responded = error.status > 0;
    return new MetaError({
      code: responded ? 'invalid_response' : 'invalid_request',
      status: error.status,
      message: responded
        ? `${operation} response did not match the expected shape`
        : error.message,
      issues: error.issues,
      cause: error,
    });
  }
  const code = noResponseCode(error.cause);
  const message =
    code === 'timeout'
      ? `${operation} timed out after ${String(timeoutMs)} ms`
      : code === 'invalid_response'
        ? `${operation} returned a response that is not JSON`
        : `${operation} request failed: ${messageOf(error.cause)}`;
  return new MetaError({
    code,
    // A non-JSON 2xx did arrive: keep its status.
    status: code === 'invalid_response' ? error.status : 0,
    message,
    cause: error,
  });
}
