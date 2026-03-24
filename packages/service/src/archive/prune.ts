/**
 * Prune old archive snapshots beyond maxArchive.
 *
 * @module archive/prune
 */

import { unlink } from 'node:fs/promises';

import { listArchiveFiles } from './listArchive.js';

/**
 * Prune archive directory to keep at most maxArchive snapshots.
 * Removes the oldest files.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @param maxArchive - Maximum snapshots to retain.
 * @returns Number of files pruned.
 */
export async function pruneArchive(
  metaPath: string,
  maxArchive: number,
): Promise<number> {
  const files = listArchiveFiles(metaPath);
  const toRemove = files.length - maxArchive;
  if (toRemove <= 0) return 0;

  await Promise.all(files.slice(0, toRemove).map(unlink));

  return toRemove;
}
