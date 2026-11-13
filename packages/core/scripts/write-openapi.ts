/**
 * Writes meta-core's `openapi.json` from `META_CATALOG`. Run with
 * `npm run openapi` after changing the catalog (the drift test fails until
 * you do); release-it runs it after each version bump. The build never
 * writes it.
 *
 * @module scripts/write-openapi
 */

import { writeOpenApiDocument } from '@karmaniverous/jeeves/openapi';

import { META_CATALOG } from '../src/catalog.js';
import { OPENAPI_FILE, openApiInfo } from './openapiInfo.js';

writeOpenApiDocument(META_CATALOG, openApiInfo(), OPENAPI_FILE);
console.log(`Wrote ${OPENAPI_FILE}`);
