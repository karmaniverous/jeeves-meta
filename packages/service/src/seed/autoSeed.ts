/**
 * Auto-seed pass — scan for directories matching policy rules and seed them.
 *
 * Runs before discovery in each scheduler tick. For each auto-seed rule,
 * walks matching directories via the watcher and creates .meta/ directories
 * for those that don't already have one.
 *
 * Rules are processed in array order; last match wins for steer/crossRefs.
 *
 * @module seed/autoSeed
 */

import type { WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';
import type { AutoSeedRule } from '../schema/config.js';
import { createMeta, metaExists } from './createMeta.js';

/** Result of a single auto-seed pass. */
export interface AutoSeedResult {
  /** Number of new metas created. */
  seeded: number;
  /** Paths that were seeded. */
  paths: string[];
}

/**
 * Extract parent directory paths from watcher walk results.
 *
 * Walk returns file paths; we need the unique set of immediate parent
 * directories that could be owners.
 */
function extractDirectories(filePaths: string[]): string[] {
  const dirs = new Set<string>();
  for (const fp of filePaths) {
    const lastSlash = fp.lastIndexOf('/');
    if (lastSlash > 0) {
      dirs.add(fp.substring(0, lastSlash));
    }
  }
  return [...dirs];
}

/**
 * Run the auto-seed pass: apply policy rules and create missing metas.
 *
 * @param rules - Auto-seed policy rules from config.
 * @param watcher - Watcher client for filesystem enumeration.
 * @param logger - Logger for reporting seed actions.
 * @returns Summary of what was seeded.
 */
export async function autoSeedPass(
  rules: AutoSeedRule[],
  watcher: WatcherClient,
  logger?: MinimalLogger,
): Promise<AutoSeedResult> {
  if (rules.length === 0) return { seeded: 0, paths: [] };

  // Build a map of ownerPath → effective options (last match wins)
  const candidates = new Map<
    string,
    { steer?: string; crossRefs?: string[] }
  >();

  for (const rule of rules) {
    const files = await watcher.walk([rule.match]);
    const dirs = extractDirectories(files);
    for (const dir of dirs) {
      candidates.set(dir, {
        steer: rule.steer,
        crossRefs: rule.crossRefs,
      });
    }
  }

  // Filter out paths that already have .meta/meta.json
  const toSeed: Array<{
    path: string;
    steer?: string;
    crossRefs?: string[];
  }> = [];
  for (const [path, opts] of candidates) {
    if (!metaExists(path)) {
      toSeed.push({ path, ...opts });
    }
  }

  // Seed remaining
  const seededPaths: string[] = [];
  for (const candidate of toSeed) {
    try {
      await createMeta(candidate.path, {
        steer: candidate.steer,
        crossRefs: candidate.crossRefs,
      });
      seededPaths.push(candidate.path);
      logger?.info({ path: candidate.path }, 'auto-seeded meta');
    } catch (err) {
      logger?.warn(
        {
          path: candidate.path,
          err: err instanceof Error ? err.message : String(err),
        },
        'auto-seed failed for path',
      );
    }
  }

  return { seeded: seededPaths.length, paths: seededPaths };
}
