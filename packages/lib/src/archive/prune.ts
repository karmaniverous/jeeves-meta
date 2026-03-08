/**
 * Prune old archive snapshots beyond maxArchive.
 *
 * @module archive/prune
 */

import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prune archive directory to keep at most maxArchive snapshots.
 * Removes the oldest files (sorted alphabetically = chronologically for ISO timestamps).
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @param maxArchive - Maximum snapshots to retain.
 * @returns Number of files pruned.
 */
export function pruneArchive(metaPath: string, maxArchive: number): number {
  const archiveDir = join(metaPath, 'archive');
  let files: string[];
  try {
    files = readdirSync(archiveDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return 0;
  }

  const toRemove = files.length - maxArchive;
  if (toRemove <= 0) return 0;

  for (let i = 0; i < toRemove; i++) {
    unlinkSync(join(archiveDir, files[i]));
  }

  return toRemove;
}
