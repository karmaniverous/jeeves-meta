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
import { paginatedScan } from '../paginatedScan.js';
import type { SynthConfig } from '../schema/index.js';

/**
 * Build a Qdrant filter from config metaProperty.
 *
 * @param config - Synth config with metaProperty.
 * @returns Qdrant filter object for scanning live metas.
 */
export function buildMetaFilter(config: SynthConfig): Record<string, unknown> {
  return {
    must: [
      {
        key: 'domains',
        match: { value: config.metaProperty.domains[0] },
      },
    ],
  };
}

/**
 * Discover all .meta/ directories via watcher scan.
 *
 * Queries the watcher for indexed .meta/meta.json points using the
 * configured domain filter. Returns deduplicated meta directory paths.
 *
 * @param config - Synth config (for domain filter).
 * @param watcher - WatcherClient for scan queries.
 * @returns Array of normalized .meta/ directory paths.
 */
export async function discoverMetas(
  config: SynthConfig,
  watcher: WatcherClient,
): Promise<string[]> {
  const filter = buildMetaFilter(config);

  const scanFiles = await paginatedScan(watcher, {
    filter,
    fields: ['file_path'],
  });

  // Deduplicate by file_path (multi-chunk files)
  const seen = new Set<string>();
  const metaPaths: string[] = [];

  for (const sf of scanFiles) {
    const fp = normalizePath(sf.file_path);
    if (seen.has(fp)) continue;
    seen.add(fp);

    // Derive .meta/ directory from file_path (strip /meta.json)
    const metaPath = fp.replace(/\/meta\.json$/, '');
    metaPaths.push(metaPath);
  }

  return metaPaths;
}
