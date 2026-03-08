/**
 * Read the latest archive snapshot for steer change detection.
 *
 * @module archive/readLatest
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MetaJson } from '../schema/index.js';

/**
 * Read the most recent archive snapshot.
 *
 * @param metaPath - Absolute path to the .meta directory.
 * @returns The latest archived meta, or null if no archives exist.
 */
export function readLatestArchive(metaPath: string): MetaJson | null {
  const archiveDir = join(metaPath, 'archive');
  let files: string[];
  try {
    files = readdirSync(archiveDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return null;
  }

  if (files.length === 0) return null;

  const latest = join(archiveDir, files[files.length - 1]);
  const raw = readFileSync(latest, 'utf8');
  return JSON.parse(raw) as MetaJson;
}
