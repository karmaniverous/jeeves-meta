/**
 * Compute the file scope owned by a meta node.
 *
 * A meta owns: parent dir + all descendants, minus:
 * - Its own .meta/ subtree (outputs, not inputs)
 * - Child meta ownerPath subtrees (except their .meta/meta.json for rollups)
 *
 * Uses filesystem walks instead of watcher scans for performance.
 *
 * @module discovery/scope
 */

import { statSync } from 'node:fs';
import type { WatcherClient } from '../interfaces/index.js';
import type { MetaNode } from './types.js';

/**
 * Get the scope path prefix for a meta node.
 */
export function getScopePrefix(node: MetaNode): string {
  return node.ownerPath;
}

/**
 * Filter a list of file paths to only those in scope for a meta node.
 *
 * Excludes:
 * - The node's own .meta/ subtree (synthesis outputs are not scope inputs)
 * - Child meta ownerPath subtrees (except child .meta/meta.json for rollups)
 *
 * walkFiles already returns normalized forward-slash paths.
 */
export function filterInScope(node: MetaNode, files: string[]): string[] {
  const prefix = node.ownerPath + '/';
  const ownMetaPrefix = node.metaPath + '/';
  const exclusions = node.children.map((c) => c.ownerPath + '/');
  const childMetaJsons = new Set(
    node.children.map((c) => c.metaPath + '/meta.json'),
  );

  return files.filter((f) => {
    // Must be under ownerPath
    if (!f.startsWith(prefix) && f !== node.ownerPath) return false;

    // Exclude own .meta/ subtree (outputs are not inputs)
    if (f.startsWith(ownMetaPrefix)) return false;

    // Check if under a child meta's subtree
    for (const excl of exclusions) {
      if (f.startsWith(excl)) {
        // Exception: child meta.json files are included as rollup inputs
        return childMetaJsons.has(f);
      }
    }

    return true;
  });
}

/** Result of getScopeFiles. */
export interface ScopeFilesResult {
  /** Files directly owned by this meta (excluding child subtrees and own .meta/). */
  scopeFiles: string[];
  /** All files under the owner path (including child subtrees). */
  allFiles: string[];
}

/**
 * Get all files in scope for a meta node via watcher walk.
 */
export async function getScopeFiles(
  node: MetaNode,
  watcher: WatcherClient,
): Promise<ScopeFilesResult> {
  const allFiles = await watcher.walk([`${node.ownerPath}/**`]);
  return {
    scopeFiles: filterInScope(node, allFiles),
    allFiles,
  };
}

/**
 * Get files modified since a given timestamp within a meta node's scope.
 *
 * If no generatedAt is provided (first run), returns all scope files.
 * Reuses scope files from getScopeFiles() and filters locally by mtime.
 */
export function getDeltaFiles(
  node: MetaNode,
  generatedAt: string | undefined,
  scopeFiles: string[],
): string[] {
  if (!generatedAt) return scopeFiles;

  const modifiedAfterMs = new Date(generatedAt).getTime();

  return scopeFiles.filter((filePath) => {
    try {
      const stat = statSync(filePath);
      return stat.mtimeMs > modifiedAfterMs;
    } catch {
      // If we can't stat the file, exclude it
      return false;
    }
  });
}
