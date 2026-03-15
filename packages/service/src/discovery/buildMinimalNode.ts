/**
 * Build a minimal MetaNode from a known meta path using watcher walk.
 *
 * Used for targeted synthesis (when a specific path is requested) to avoid
 * the full discovery + ownership tree build. Discovers only immediate child
 * `.meta/` directories.
 *
 * @module discovery/buildMinimalNode
 */

import { dirname } from 'node:path';

import type { WatcherClient } from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';
import type { MetaNode } from './types.js';

/**
 * Build a minimal MetaNode for a known meta path.
 *
 * Walks the owner directory for child `.meta/meta.json` files and constructs
 * a shallow ownership tree (self + direct children only).
 *
 * @param metaPath - Absolute path to the `.meta/` directory.
 * @param watcher - WatcherClient for filesystem enumeration.
 * @returns MetaNode with direct children wired.
 */
export async function buildMinimalNode(
  metaPath: string,
  watcher: WatcherClient,
): Promise<MetaNode> {
  const normalized = normalizePath(metaPath);
  const ownerPath = normalizePath(dirname(metaPath));

  // Find child metas using watcher walk.
  // We include only *direct* children (nearest descendants in the ownership tree)
  // to match the ownership semantics used elsewhere.
  const rawMetaJsonPaths = await watcher.walk([
    `${ownerPath}/**/.meta/meta.json`,
  ]);

  const candidateMetaPaths = [
    ...new Set(rawMetaJsonPaths.map((p) => normalizePath(dirname(p)))),
  ].filter((p) => p !== normalized);

  const candidates = candidateMetaPaths
    .map((mp) => ({ metaPath: mp, ownerPath: normalizePath(dirname(mp)) }))
    .sort((a, b) => a.ownerPath.length - b.ownerPath.length);

  const directChildren: Array<{ metaPath: string; ownerPath: string }> = [];
  for (const c of candidates) {
    const nestedUnderExisting = directChildren.some(
      (d) =>
        c.ownerPath === d.ownerPath ||
        c.ownerPath.startsWith(d.ownerPath + '/'),
    );
    if (!nestedUnderExisting) directChildren.push(c);
  }

  const children: MetaNode[] = directChildren.map((c) => ({
    metaPath: c.metaPath,
    ownerPath: c.ownerPath,
    treeDepth: 1,
    children: [],
    parent: null,
  }));

  const node: MetaNode = {
    metaPath: normalized,
    ownerPath,
    treeDepth: 0,
    children,
    parent: null,
  };

  for (const child of children) {
    child.parent = node;
  }

  return node;
}
