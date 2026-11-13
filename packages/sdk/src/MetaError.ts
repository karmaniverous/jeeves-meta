/**
 * @module MetaError
 * The single error class thrown by the SDK: client-side validation, timeouts, network failures, non-2xx responses and unparseable responses. Pure.
 */

import type { ErrorBody } from '@karmaniverous/jeeves/catalog';
import type { MetaErrorCode } from '@karmaniverous/jeeves-meta-core';

/**
 * Codes the SDK assigns itself (lower case, so they never collide with a
 * server code). An error from a non-2xx response carries the server's code
 * instead: the body's `code` (a `MetaErrorCode` from core
 * `META_ERROR_CODES`, a jeeves `JEEVES_*` code or a Fastify `FST_ERR_*`
 * code), else `http_<status>` (a masked 500, an unknown route, a body that
 * isn't Fastify's).
 *
 * - `invalid_options`: {@link createMetaClient} options are invalid.
 * - `invalid_request`: the input failed the catalog entry's request schema; nothing was sent.
 * - `invalid_response`: a 2xx response was not JSON or failed the entry's response schema.
 * - `timeout`: no response within the call's timeout.
 * - `network_error`: `fetch` rejected (connection refused, DNS failure, ...).
 */
export type MetaClientErrorCode =
  | 'invalid_options'
  | 'invalid_request'
  | 'invalid_response'
  | 'timeout'
  | 'network_error';

/**
 * What {@link MetaError.code} holds: a meta code, a client code,
 * `http_<status>`, or any other server code (`JEEVES_*`, `FST_ERR_*`); the
 * named ones autocomplete.
 */
export type MetaErrorCodeValue =
  MetaErrorCode | MetaClientErrorCode | `http_${number}` | (string & {});

/** Constructor fields of a {@link MetaError}. */
export interface MetaErrorInit {
  /** The server's code, `http_<status>` or a {@link MetaClientErrorCode}. */
  code: MetaErrorCodeValue;
  /** Human-readable message (a response's: the body's `message`). */
  message: string;
  /** HTTP status when a response arrived, else 0. */
  status: number;
  /** Parsed error body of a non-2xx response. */
  body?: ErrorBody;
  /** The non-2xx response body exactly as received. */
  responseText?: string;
  /** Zod issues of an `invalid_request` or `invalid_response`. */
  issues?: unknown;
  /** Underlying error, if any. */
  cause?: unknown;
}

/**
 * The one error type thrown by every SDK call. The SDK never retries;
 * branch on `code` (`META_NOT_FOUND`, `META_WATCHER_UNAVAILABLE`,
 * `META_NOT_READY`, ...), never on `message`;
 * `status` is the HTTP status.
 */
export class MetaError extends Error {
  /**
   * Machine-readable code: the response body's `code` (`META_*`,
   * `JEEVES_*`, `FST_ERR_*`), else `http_<status>`, or a
   * {@link MetaClientErrorCode} when no usable response arrived.
   */
  readonly code: MetaErrorCodeValue;
  /** HTTP status when a response arrived, else 0. */
  readonly status: number;
  /**
   * Parsed error body of a non-2xx response: Fastify's standard body
   * `{ statusCode, code?, error, message }`.
   */
  readonly body?: ErrorBody;
  /** The non-2xx response body exactly as received (JSON or not). */
  readonly responseText?: string;
  /** Zod issues of an `invalid_request` or `invalid_response`. */
  readonly issues?: unknown;

  /**
   * Create a meta error.
   *
   * @param init - Code, message, status and optional body, text, issues and cause.
   */
  constructor(init: MetaErrorInit) {
    super(init.message, init.cause === undefined ? {} : { cause: init.cause });
    this.name = 'MetaError';
    this.code = init.code;
    this.status = init.status;
    this.body = init.body;
    this.responseText = init.responseText;
    this.issues = init.issues;
  }
}

/**
 * The body of a non-2xx response as text: exactly as received when it was
 * captured, else the parsed body as JSON (`{}` when there is none).
 *
 * @param error - A MetaError with an HTTP status.
 * @returns The body text.
 */
export function errorBodyText(error: MetaError): string {
  return error.responseText ?? JSON.stringify(error.body ?? {});
}

/**
 * Type guard for {@link MetaError}.
 *
 * @param value - Any value (typically a caught error).
 * @returns `true` when `value` is a {@link MetaError}.
 */
export function isMetaError(value: unknown): value is MetaError {
  return value instanceof MetaError;
}
