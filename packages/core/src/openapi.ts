/**
 * meta-core's committed OpenAPI 3.1 document for `META_CATALOG`, bundled as
 * `META_OPENAPI_DOCUMENT` (the service serves it at `GET /openapi.json`).
 * Also published as the `@karmaniverous/jeeves-meta-core/openapi.json`
 * sub-path for out-of-repo generators. Pure.
 *
 * @module openapi
 */

import document from '../openapi.json';

/**
 * The OpenAPI document generated from `META_CATALOG` (`npm run openapi`).
 *
 * @remarks
 * Typed loosely so meta-core's declarations don't depend on OpenAPI type
 * packages.
 */
export const META_OPENAPI_DOCUMENT: Readonly<Record<string, unknown>> =
  document;
