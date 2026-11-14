/**
 * Shared parts of the custom tools: catalog descriptions, the mapping of
 * tool parameters to query strings, and the call wrapper that turns a
 * failure into the 0.16.0-worded tool error. Pure.
 *
 * @module toolHelpers
 */

import { ok, type ToolResult } from '@karmaniverous/jeeves';
import {
  META_CATALOG,
  type MetaEntryName,
} from '@karmaniverous/jeeves-meta-core';

import { toolError } from './toolError.js';

/** A catalog entry's description. */
export function entryDescription(name: MetaEntryName): string {
  const entry = META_CATALOG.entries.find((e) => e.name === name);
  return entry?.description ?? '';
}

/** A number or boolean as a query string; anything else stays absent. */
export const str = (value: unknown): string | undefined =>
  typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;

/** A boolean filter as its query flag; undefined stays absent. */
export const flag = (value: unknown): 'true' | 'false' | undefined =>
  value === undefined ? undefined : value ? 'true' : 'false';

/** A field list as the comma-separated query value. */
export const list = (value: unknown): string | undefined =>
  Array.isArray(value) && value.length > 0 ? value.join(',') : undefined;

/** Run a call: its result, or the 0.16.0-worded error (`toolError`). */
export function wrap(
  baseUrl: string,
  fn: () => Promise<unknown>,
): Promise<ToolResult> {
  return fn()
    .then(ok)
    .catch((error: unknown) => toolError(error, baseUrl));
}
