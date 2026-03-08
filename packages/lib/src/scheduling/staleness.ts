/**
 * Staleness detection via watcher scan.
 *
 * A meta is stale when any file in its scope was modified after _generatedAt.
 *
 * @module scheduling/staleness
 */

import type { WatcherClient } from '../interfaces/index.js';
import type { MetaJson } from '../schema/index.js';

/**
 * Check if a meta is stale by querying the watcher for modified files.
 *
 * @param scopePrefix - Path prefix for this meta's scope.
 * @param meta - Current meta.json content.
 * @param watcher - WatcherClient instance.
 * @returns True if any file in scope was modified after _generatedAt.
 */
export async function isStale(
  scopePrefix: string,
  meta: MetaJson,
  watcher: WatcherClient,
): Promise<boolean> {
  if (!meta._generatedAt) return true; // Never synthesized = stale

  const generatedAtUnix = Math.floor(
    new Date(meta._generatedAt).getTime() / 1000,
  );

  const result = await watcher.scan({
    pathPrefix: scopePrefix,
    modifiedAfter: generatedAtUnix,
    limit: 1,
  });

  return result.files.length > 0;
}

/**
 * Compute actual staleness in seconds (now minus _generatedAt).
 *
 * @param meta - Current meta.json content.
 * @returns Staleness in seconds, or Infinity if never synthesized.
 */
export function actualStaleness(meta: MetaJson): number {
  if (!meta._generatedAt) return Infinity;
  const generatedMs = new Date(meta._generatedAt).getTime();
  return (Date.now() - generatedMs) / 1000;
}
