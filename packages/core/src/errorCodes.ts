/**
 * The client's half of the jeeves-meta error contract (spec 4.4.4, #243):
 * every `META_*` code a meta error body can carry (`META_ERROR_CODES`) and
 * the HTTP status each is sent with (`META_ERROR_STATUS`). The body itself
 * is Fastify's standard error body (`errorBodySchema` from
 * `@karmaniverous/jeeves/catalog`). Pure data.
 *
 * @module errorCodes
 */

/**
 * Every `META_*` code a non-2xx jeeves-meta response can carry. The body is
 * `{ statusCode, code?, error, message }`; other codes come from jeeves
 * (`JEEVES_*`) and Fastify (`FST_ERR_*`), and an unexpected failure is a
 * 500 with no `code`. No meta error sends `Retry-After`.
 *
 * - `META_INVALID_JSONPATH` (400): `GET /config?path=` with a JSONPath that
 *   cannot be evaluated.
 * - `META_NOT_FOUND` (404): no meta at the path given to `metaDetail`,
 *   `updateMeta` or `preview`.
 * - `META_ALREADY_EXISTS` (409): `seed` where a `.meta/` already exists.
 * - `META_NOT_LOCKED` (409): `unlock` where there is no lock file.
 * - `META_CONFIG_UNAVAILABLE` (500): `configApply` with no runtime config
 *   path.
 * - `META_WATCHER_UNAVAILABLE` (503): `listMetas`, `preview` or
 *   `synthesize` could not reach the watcher; retry later.
 * - `META_NOT_READY` (503): the service is still starting; retry shortly.
 */
export const META_ERROR_CODES = [
  'META_INVALID_JSONPATH',
  'META_NOT_FOUND',
  'META_ALREADY_EXISTS',
  'META_NOT_LOCKED',
  'META_CONFIG_UNAVAILABLE',
  'META_WATCHER_UNAVAILABLE',
  'META_NOT_READY',
] as const;

/** A `META_*` error code. */
export type MetaErrorCode = (typeof META_ERROR_CODES)[number];

/** The HTTP status each `META_*` code is sent with (one per code). */
export const META_ERROR_STATUS: Readonly<Record<MetaErrorCode, number>> = {
  META_INVALID_JSONPATH: 400,
  META_NOT_FOUND: 404,
  META_ALREADY_EXISTS: 409,
  META_NOT_LOCKED: 409,
  META_CONFIG_UNAVAILABLE: 500,
  META_WATCHER_UNAVAILABLE: 503,
  META_NOT_READY: 503,
};
