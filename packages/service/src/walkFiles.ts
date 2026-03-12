/**
 * Recursive filesystem walker for file enumeration.
 *
 * Replaces paginated watcher scans for scope/delta/staleness checks.
 * Returns normalized forward-slash paths.
 *
 * @module walkFiles
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { normalizePath } from './normalizePath.js';

/** Default directory names to always skip. */
const DEFAULT_SKIP = new Set([
  'node_modules',
  '.git',
  '.rollup.cache',
  'dist',
  'Thumbs.db',
]);

/** Options for walkFiles. */
export interface WalkFilesOptions {
  /** Directory names to exclude (in addition to defaults). */
  exclude?: string[];
  /** Only include files modified after this Unix timestamp (seconds). */
  modifiedAfter?: number;
  /** Maximum recursion depth. Default: 50. */
  maxDepth?: number;
}

/**
 * Recursively walk a directory and return all file paths.
 *
 * @param root - Root directory to walk.
 * @param options - Walk options.
 * @returns Array of normalized file paths.
 */
export function walkFiles(root: string, options?: WalkFilesOptions): string[] {
  const exclude = new Set([...DEFAULT_SKIP, ...(options?.exclude ?? [])]);
  const modifiedAfter = options?.modifiedAfter;
  const maxDepth = options?.maxDepth ?? 50;
  const results: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Permission errors, missing dirs — skip
    }

    for (const entry of entries) {
      if (exclude.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (modifiedAfter !== undefined) {
          try {
            const stat = statSync(fullPath);
            if (Math.floor(stat.mtimeMs / 1000) <= modifiedAfter) continue;
          } catch {
            continue;
          }
        }
        results.push(normalizePath(fullPath));
      }
    }
  }

  walk(root, 0);
  return results;
}
