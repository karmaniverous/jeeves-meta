/**
 * The original endpoint list of the jeeves-meta API (name, method, path,
 * description), superseded by `META_CATALOG` and kept for existing
 * consumers (Decision 183). Derived from the catalog, so names, routes and
 * descriptions have one source.
 *
 * @module endpoints
 */

import { META_CATALOG, type MetaCatalog } from './catalog.js';

/** HTTP methods used by the API. */
export type HttpMethod = 'GET' | 'PATCH' | 'POST';

/** Descriptor for a single API endpoint. */
export interface EndpointDescriptor {
  /** Unique endpoint identifier (camelCase). */
  name: string;
  /** HTTP method. */
  method: HttpMethod;
  /** URL path pattern (e.g. '/metas/:path'). */
  path: string;
  /** Human-readable description of the endpoint's purpose. */
  description: string;
}

/** The descriptor fields of catalog entry `E` (distributive). */
type Descriptor<E> = E extends {
  name: unknown;
  method: unknown;
  path: unknown;
  description: unknown;
}
  ? Pick<E, 'name' | 'method' | 'path' | 'description'>
  : never;

/** The descriptor fields of every catalog entry, in catalog order. */
type Descriptors = readonly Descriptor<MetaCatalog['entries'][number]>[];

/** Every endpoint: name, method, path and description of each entry. */
export const META_ENDPOINTS = META_CATALOG.entries.map(
  ({ name, method, path, description }) => ({
    name,
    method,
    path,
    description,
  }),
) as unknown as Descriptors;

/** Union of all endpoint names. */
export type EndpointName = (typeof META_ENDPOINTS)[number]['name'];

/** Single entry from the list, narrowed by name. */
export type Endpoint<N extends EndpointName> = Extract<
  (typeof META_ENDPOINTS)[number],
  { name: N }
>;

/**
 * Look up an endpoint descriptor by name.
 *
 * @param name - The endpoint identifier.
 * @returns The matching {@link EndpointDescriptor}.
 */
export function getEndpoint<N extends EndpointName>(name: N): Endpoint<N> {
  const ep = META_ENDPOINTS.find((e) => e.name === name);
  if (!ep) throw new Error(`Unknown endpoint: ${name}`);
  return ep as Endpoint<N>;
}
