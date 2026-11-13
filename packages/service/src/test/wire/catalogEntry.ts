/**
 * @module test/wire/catalogEntry
 * Maps a wire scenario's method and URL to the `META_CATALOG` entry that
 * serves it. Pure.
 */

import { META_CATALOG } from '@karmaniverous/jeeves-meta-core';

/** A catalog entry. */
export type MetaCatalogEntry = (typeof META_CATALOG.entries)[number];

/**
 * The catalog entry serving `method url`.
 *
 * @param method - HTTP method.
 * @param url - Request URL (query ignored).
 * @returns The entry, if any.
 */
export function entryFor(
  method: string,
  url: string,
): MetaCatalogEntry | undefined {
  const path = url.split('?')[0];
  return META_CATALOG.entries.find(
    (e) =>
      e.method === method &&
      new RegExp(`^${e.path.replace(/:\w+/g, '[^/]+')}$`).test(path),
  );
}
