/**
 * Build the SynthContext for a synthesis cycle.
 *
 * Computes shared inputs once: scope files, delta files, child meta outputs,
 * previous content/feedback, steer, and archive paths.
 *
 * @module orchestrator/contextPackage
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { MetaNode } from '../discovery/index.js';
import type { SynthContext, WatcherClient } from '../interfaces/index.js';
import type { MetaJson } from '../schema/index.js';

/**
 * Build the context package for a synthesis cycle.
 *
 * @param node - The meta node being synthesized.
 * @param meta - Current meta.json content.
 * @param watcher - WatcherClient for scope enumeration.
 * @returns The computed context package.
 */
export async function buildContextPackage(
  node: MetaNode,
  meta: MetaJson,
  watcher: WatcherClient,
): Promise<SynthContext> {
  // Scope files via watcher scan
  const scanResult = await watcher.scan({ pathPrefix: node.ownerPath });
  const allFiles = scanResult.files.map((f) => f.file_path);

  // Filter out child meta subtrees (client-side exclusion)
  const childPrefixes = node.children.map((c) => c.ownerPath + '/');
  const scopeFiles = allFiles.filter((f) => {
    for (const cp of childPrefixes) {
      if (f.startsWith(cp)) return false;
    }
    return true;
  });

  // Delta files: modified since _generatedAt
  let deltaFiles: string[] = [];
  if (meta._generatedAt) {
    const modifiedAfter = Math.floor(
      new Date(meta._generatedAt).getTime() / 1000,
    );
    const deltaResult = await watcher.scan({
      pathPrefix: node.ownerPath,
      modifiedAfter,
    });
    deltaFiles = deltaResult.files
      .map((f) => f.file_path)
      .filter((f) => {
        for (const cp of childPrefixes) {
          if (f.startsWith(cp)) return false;
        }
        return true;
      });
  } else {
    deltaFiles = scopeFiles; // First run: all files are delta
  }

  // Child meta outputs
  const childMetas: Record<string, unknown> = {};
  for (const child of node.children) {
    const childMetaFile = join(child.metaPath, 'meta.json');
    try {
      const raw = readFileSync(childMetaFile, 'utf8');
      const childMeta = JSON.parse(raw) as MetaJson;
      childMetas[child.ownerPath] = childMeta._content ?? null;
    } catch {
      childMetas[child.ownerPath] = null;
    }
  }

  // Archive paths
  const archiveDir = join(node.metaPath, 'archive');
  let archives: string[] = [];
  try {
    archives = readdirSync(archiveDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(archiveDir, f));
  } catch {
    // No archive directory yet
  }

  return {
    path: node.metaPath,
    scopeFiles,
    deltaFiles,
    childMetas,
    previousContent: meta._content ?? null,
    previousFeedback: meta._feedback ?? null,
    steer: meta._steer ?? null,
    archives,
  };
}
