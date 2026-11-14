/**
 * Tool result for a failed SDK call, worded as the 0.16.0 tools worded it
 * (spec 4.4.7). A non-2xx response reads as `Error: HTTP {status}: {body}`,
 * with the body exactly as received (now the standard error body, so the
 * text carries the code and message); an unreachable service gets the
 * connection guidance; anything else reads as `Error: {message}`. Pure.
 *
 * @module toolError
 */

import { connectionFail, fail, type ToolResult } from '@karmaniverous/jeeves';
import { CatalogClientError } from '@karmaniverous/jeeves/catalog';
import {
  errorBodyText,
  isMetaError,
  type MetaError,
} from '@karmaniverous/jeeves-meta-sdk';

import { PLUGIN_ID } from './constants.js';

/**
 * The error a status-0 `MetaError` wraps (the network error), so
 * connection guidance sees the same cause it saw in 0.16.0.
 *
 * @param error - A status-0 MetaError.
 * @returns The underlying error, or the MetaError itself.
 */
function underlying(error: MetaError): unknown {
  const inner =
    error.cause instanceof CatalogClientError ? error.cause.cause : error.cause;
  return inner ?? error;
}

/**
 * Tool result for a failed call.
 *
 * @param error - What the SDK call threw.
 * @param baseUrl - The service URL the call used.
 * @returns The error result.
 */
export function toolError(error: unknown, baseUrl: string): ToolResult {
  if (!isMetaError(error)) return fail(error);
  if (error.status >= 300) {
    return fail(
      new Error(`HTTP ${String(error.status)}: ${errorBodyText(error)}`),
    );
  }
  if (error.issues !== undefined) return fail(error);
  return connectionFail(underlying(error), baseUrl, PLUGIN_ID);
}
