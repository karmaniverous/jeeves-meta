/**
 * Shared parts of the jeeves-meta catalog entries: the `route` helper giving
 * an entry its name, method, path, description (from
 * `ENDPOINT_DESCRIPTIONS`), auth (`none`, Decision 192) and kind, and the
 * params schema the `/metas/:path` entries share. Pure.
 *
 * @module catalog/route
 */

import type { EntryKind } from '@karmaniverous/jeeves/catalog';
import { z } from 'zod';

import { ENDPOINT_DESCRIPTIONS } from '../descriptions.js';

/** jeeves-meta's own endpoint names (other than `status` and `config`). */
export type MetaRouteName = keyof typeof ENDPOINT_DESCRIPTIONS;

/**
 * Name, method, path, description, auth and kind of a jeeves-meta entry.
 *
 * @param name - Entry name (also the SDK method and OpenAPI `operationId`).
 * @param method - HTTP method.
 * @param path - Route path.
 * @param kind - What the entry does to service state (Decision 208).
 * @returns The entry's identity fields.
 */
export function route<
  const N extends MetaRouteName,
  const M extends 'GET' | 'PATCH' | 'POST',
  const P extends string,
  const K extends EntryKind,
>(name: N, method: M, path: P, kind: K) {
  return {
    name,
    method,
    path,
    description: ENDPOINT_DESCRIPTIONS[name],
    auth: 'none',
    kind,
  } as const;
}

/** `:path` of a `/metas/:path` route. */
export const metaPathParamsSchema = z.object({
  /** The meta's owner path or `.meta/` path, URI-encoded once. */
  path: z
    .string()
    .describe("The meta's owner path or .meta/ path (URI-encoded)."),
});
