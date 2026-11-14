/**
 * The jeeves-meta endpoint catalog (`META_CATALOG`, Decision 183): one
 * Zod-described entry per route, from which the service's routes and
 * validation, the OpenAPI document, the SDK client and the plugin's tools
 * are derived; plus the types inferred from it. Pure.
 *
 * @remarks
 * 13 entries, in the order of the deprecated `META_ENDPOINTS`. `status` and
 * `config` are jeeves' standard entries; `configApply` is meta's own
 * (jeeves' name, path and body, meta's response; Decision 203). Every entry
 * is `auth: 'none'` (Decision 192).
 *
 * @module catalog
 */

import {
  type CatalogInput,
  type ClientResponse,
  defineCatalog,
  standardEntries,
} from '@karmaniverous/jeeves/catalog';
import type { z } from 'zod';

import { metaHealthSchema } from './catalog/health.js';
import {
  metaDetailQuerySchema,
  metasQuerySchema,
  previewQuerySchema,
  seedBodySchema,
  synthesizeBodySchema,
  unlockBodySchema,
  updateBodySchema,
} from './catalog/requests.js';
import {
  abortResponseSchema,
  configApplyResponseSchema,
  metaDetailResponseSchema,
  metasResponseSchema,
  previewResponseSchema,
  queueClearResponseSchema,
  queueResponseSchema,
  seedResponseSchema,
  synthesizeResponseSchema,
  unlockResponseSchema,
  updateMetaResponseSchema,
} from './catalog/responses.js';
import { metaPathParamsSchema, route } from './catalog/route.js';

const [statusEntry, configEntry, standardConfigApply] = standardEntries(
  'meta',
  { auth: { config: 'none' }, healthSchema: metaHealthSchema },
);

/** The jeeves-meta endpoint catalog. */
export const META_CATALOG = defineCatalog([
  statusEntry,
  {
    ...route('listMetas', 'GET', '/metas', 'read'),
    query: metasQuerySchema,
    response: metasResponseSchema,
  },
  {
    ...route('metaDetail', 'GET', '/metas/:path', 'read'),
    params: metaPathParamsSchema,
    query: metaDetailQuerySchema,
    response: metaDetailResponseSchema,
  },
  {
    ...route('updateMeta', 'PATCH', '/metas/:path', 'write'),
    params: metaPathParamsSchema,
    body: updateBodySchema,
    response: updateMetaResponseSchema,
  },
  {
    ...route('synthesize', 'POST', '/synthesize', 'write'),
    body: synthesizeBodySchema,
    response: synthesizeResponseSchema,
  },
  {
    ...route('abort', 'POST', '/synthesize/abort', 'destructive'),
    response: abortResponseSchema,
  },
  {
    ...route('preview', 'GET', '/preview', 'read'),
    query: previewQuerySchema,
    response: previewResponseSchema,
  },
  {
    ...route('seed', 'POST', '/seed', 'write'),
    body: seedBodySchema,
    response: seedResponseSchema,
  },
  {
    ...route('unlock', 'POST', '/unlock', 'destructive'),
    body: unlockBodySchema,
    response: unlockResponseSchema,
  },
  configEntry,
  {
    ...route('configApply', 'POST', '/config/apply', 'write'),
    body: standardConfigApply.body,
    response: configApplyResponseSchema,
  },
  {
    ...route('queue', 'GET', '/queue', 'read'),
    response: queueResponseSchema,
  },
  {
    ...route('queueClear', 'POST', '/queue/clear', 'destructive'),
    response: queueClearResponseSchema,
  },
]);

/** The jeeves-meta endpoint catalog's type. */
export type MetaCatalog = typeof META_CATALOG;

/** Name of a jeeves-meta catalog entry. */
export type MetaEntryName = MetaCatalog['entries'][number]['name'];

/** The catalog entry named `N`. */
export type MetaEntry<N extends MetaEntryName> = Extract<
  MetaCatalog['entries'][number],
  { name: N }
>;

/** Request input of entry `N` (params, query and body fields, flat). */
export type MetaInput<N extends MetaEntryName> = CatalogInput<MetaEntry<N>>;

/** Successful response body of entry `N`. */
export type MetaResponse<N extends MetaEntryName> = ClientResponse<
  MetaEntry<N>
>;

/** jeeves-meta's `health` block in `GET /status`. */
export type MetaHealth = z.output<typeof metaHealthSchema>;
