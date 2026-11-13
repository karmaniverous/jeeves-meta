/**
 * Location and `info` block of meta-core's committed OpenAPI document
 * (`openapi.json`), shared by the writer (`write-openapi.ts`) and the drift
 * test. Reads `package.json`; no writes.
 *
 * @module scripts/openapiInfo
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { OpenApiInfo } from '@karmaniverous/jeeves/openapi';

/** The committed document. */
export const OPENAPI_FILE = fileURLToPath(
  new URL('../openapi.json', import.meta.url),
);

/**
 * The document's `info`: title, meta-core's current version, description.
 *
 * @returns OpenAPI `info`.
 */
export function openApiInfo(): OpenApiInfo {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return {
    title: 'jeeves-meta',
    version: pkg.version,
    description:
      'HTTP API of the jeeves-meta service: the routes in its endpoint catalog (META_CATALOG). The API has no authentication: restrict the bind address or firewall the port.',
  };
}
