/**
 * The original endpoint list of the jeeves-meta API (name, method, path,
 * description), superseded by `META_CATALOG` and kept for existing
 * consumers (Decision 183). Derived from the catalog, so names, routes and
 * descriptions have one source. Pure.
 *
 * @remarks
 * Only the deprecated aliases are exported, so the package entry re-exports
 * this module with `export *` (a named re-export of a deprecated symbol fails
 * `no-deprecated`); the list and its types are module-internal.
 *
 * @module endpoints
 */

import { META_CATALOG, type MetaCatalog } from './catalog.js';

/** HTTP methods used by the API. */
type Method = 'GET' | 'PATCH' | 'POST';

/** Descriptor for a single API endpoint. */
interface Descriptor {
  /** Unique endpoint identifier (camelCase). */
  name: string;
  /** HTTP method. */
  method: Method;
  /** URL path pattern (e.g. '/metas/:path'). */
  path: string;
  /** Human-readable description of the endpoint's purpose. */
  description: string;
}

/** The descriptor fields of catalog entry `E` (distributive). */
type EntryDescriptor<E> = E extends {
  name: unknown;
  method: unknown;
  path: unknown;
  description: unknown;
}
  ? Pick<E, 'name' | 'method' | 'path' | 'description'>
  : never;

/** The descriptor fields of every catalog entry, in catalog order. */
type Descriptors = readonly EntryDescriptor<MetaCatalog['entries'][number]>[];

const ENDPOINTS = META_CATALOG.entries.map(
  ({ name, method, path, description }) => ({
    name,
    method,
    path,
    description,
  }),
) as unknown as Descriptors;

/** Union of all endpoint names. */
type Name = (typeof ENDPOINTS)[number]['name'];

/** Single entry from the list, narrowed by name. */
type Entry<N extends Name> = Extract<(typeof ENDPOINTS)[number], { name: N }>;

/**
 * HTTP methods used by the API.
 *
 * @deprecated Use `META_CATALOG` entries (`CatalogEntry['method']`).
 */
export type HttpMethod = Method;

/**
 * Descriptor for a single API endpoint.
 *
 * @deprecated Use `META_CATALOG` entries, which add schemas, auth and kind.
 */
export type EndpointDescriptor = Descriptor;

/**
 * Every endpoint: name, method, path and description of each entry.
 *
 * @deprecated Use `META_CATALOG.entries`.
 */
export const META_ENDPOINTS = ENDPOINTS;

/**
 * Union of all endpoint names.
 *
 * @deprecated Use `MetaEntryName`.
 */
export type EndpointName = Name;

/**
 * Single entry from the list, narrowed by name.
 *
 * @deprecated Use `MetaEntry<N>`.
 */
export type Endpoint<N extends Name> = Entry<N>;

/**
 * Look up an endpoint descriptor by name.
 *
 * @param name - The endpoint identifier.
 * @returns The matching descriptor.
 * @deprecated Find the entry in `META_CATALOG.entries`.
 */
export function getEndpoint<N extends Name>(name: N): Entry<N> {
  const ep = ENDPOINTS.find((e) => e.name === name);
  if (!ep) throw new Error(`Unknown endpoint: ${name}`);
  return ep as Entry<N>;
}
