/**
 * Every error jeeves-meta means a caller to see, as a jeeves `defineError`
 * class (spec 4.4.4, #243): a `META_*` code, a caller-facing message and the
 * status core's `META_ERROR_STATUS` gives it. jeeves' catalog scope (and
 * `registerErrorHandlers`) sends them as Fastify's standard error body;
 * anything else thrown is a masked 500 with no code. Pure.
 *
 * @module api/errors
 */

import { defineError } from '@karmaniverous/jeeves/fastify';
import { META_ERROR_STATUS } from '@karmaniverous/jeeves-meta-core';

/** Longest caller-supplied `%s` argument a message carries. */
export const MESSAGE_ARG_MAX = 300;

/**
 * Cap a caller-supplied `%s` argument at {@link MESSAGE_ARG_MAX} characters
 * (code points; an ellipsis marks a cut). Pure.
 *
 * @param value - The argument.
 * @returns It, at most {@link MESSAGE_ARG_MAX} characters long.
 */
export function capArg(value: string): string {
  const chars = Array.from(value);
  return chars.length <= MESSAGE_ARG_MAX
    ? value
    : `${chars.slice(0, MESSAGE_ARG_MAX - 1).join('')}…`;
}

/** `GET /config?path=` with a JSONPath that cannot be evaluated (212). */
export const MetaInvalidJsonPath = defineError(
  'META_INVALID_JSONPATH',
  'Invalid JSONPath: %s',
  META_ERROR_STATUS.META_INVALID_JSONPATH,
);

/** No meta at the given path; `%s` is the path. */
export const MetaNotFound = defineError(
  'META_NOT_FOUND',
  'Meta path not found: %s',
  META_ERROR_STATUS.META_NOT_FOUND,
);

/** `seed` where a `.meta/` exists; `%s` is the `.meta/` path. */
export const MetaAlreadyExists = defineError(
  'META_ALREADY_EXISTS',
  '.meta directory already exists at %s',
  META_ERROR_STATUS.META_ALREADY_EXISTS,
);

/** `unlock` with no lock file; `%s` is the `.meta/` path. */
export const MetaNotLocked = defineError(
  'META_NOT_LOCKED',
  'No lock file at %s (already unlocked)',
  META_ERROR_STATUS.META_NOT_LOCKED,
);

/** `configApply` with no runtime config path. */
export const MetaConfigUnavailable = defineError(
  'META_CONFIG_UNAVAILABLE',
  'No runtime config path available',
  META_ERROR_STATUS.META_CONFIG_UNAVAILABLE,
);

/** The watcher could not be reached; `%s` is what could not be done. */
export const MetaWatcherUnavailable = defineError(
  'META_WATCHER_UNAVAILABLE',
  'Watcher unreachable — cannot %s',
  META_ERROR_STATUS.META_WATCHER_UNAVAILABLE,
);

/** A request during start-up (Decision 199). */
export const MetaNotReady = defineError(
  'META_NOT_READY',
  'The service is starting; retry shortly.',
  META_ERROR_STATUS.META_NOT_READY,
);
