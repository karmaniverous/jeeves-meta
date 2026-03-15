/**
 * Discover .meta/ directories via watcher scan.
 *
 * Replaces filesystem-based globMetas() with a watcher query
 * that returns indexed .meta/meta.json points, filtered by domain.
 *
 * @module discovery/discoverMetas
 */

import type { WatcherClient } from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';

/**
 * Discover all .meta/ directories via watcher walk.
 *
 * Uses the watcher's `/walk` endpoint to find all `.meta/meta.json` files
 * and returns deduplicated meta directory paths.
 *
 * @param watcher - WatcherClient for walk queries.
 * @returns Array of normalized .meta/ directory paths.
 */
export async function discoverMetas(watcher: WatcherClient): Promise<string[]> {
  const allPaths = await watcher.walk(['**/.meta/meta.json']);

  // Deduplicate by .meta/ directory path (handles multi-chunk files)
  const seen = new Set<string>();
  const metaPaths: string[] = [];

  for (const filePath of allPaths) {
    const fp = normalizePath(filePath);
    // Derive .meta/ directory from file_path (strip /meta.json)
    const metaPath = fp.replace(/\/meta\.json$/, '');
    if (seen.has(metaPath)) continue;
    seen.add(metaPath);
    metaPaths.push(metaPath);
  }

  return metaPaths;
}
