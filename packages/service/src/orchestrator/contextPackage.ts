/**
 * Build the MetaContext for a synthesis cycle.
 *
 * Computes shared inputs once: scope files, delta files, child meta outputs,
 * previous content/feedback, steer, and archive paths.
 *
 * @module orchestrator/contextPackage
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { listArchiveFiles } from '../archive/index.js';
import {
  getDeltaFiles,
  getScopeFiles,
  type MetaNode,
} from '../discovery/index.js';
import type { MetaContext, WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';
import type { MetaJson } from '../schema/index.js';

/**
 * Condense a file list into glob-like summaries.
 * Groups by directory + extension pattern.
 *
 * @param files - Array of file paths.
 * @param maxIndividual - Show individual files up to this count.
 * @returns Condensed summary string.
 */
export function condenseScopeFiles(
  files: string[],
  maxIndividual: number = 30,
): string {
  if (files.length <= maxIndividual) return files.join('\n');

  // Group by dir + extension
  const groups = new Map<string, number>();
  for (const f of files) {
    const dir = f.substring(0, f.lastIndexOf('/') + 1) || './';
    const ext = f.includes('.') ? f.substring(f.lastIndexOf('.')) : '(no ext)';
    const key = dir + '*' + ext;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  // Sort by count descending
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  return sorted
    .map(([pattern, count]) => pattern + ' (' + count.toString() + ' files)')
    .join('\n');
}

/**
 * Read a meta.json file and extract its `_content` field.
 *
 * @param metaJsonPath - Absolute path to a meta.json file.
 * @returns The `_content` string, or null if missing/unreadable.
 */
async function readMetaContent(metaJsonPath: string): Promise<string | null> {
  try {
    const raw = await readFile(metaJsonPath, 'utf8');
    const meta = JSON.parse(raw) as MetaJson;
    return meta._content ?? null;
  } catch {
    return null;
  }
}

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
  logger?: MinimalLogger,
): Promise<MetaContext> {
  // Scope and delta files via watcher walk
  const scopeStart = Date.now();
  const { scopeFiles } = await getScopeFiles(node, watcher, logger);
  const deltaFiles = getDeltaFiles(meta._generatedAt, scopeFiles);
  logger?.debug(
    {
      scopeFiles: scopeFiles.length,
      deltaFiles: deltaFiles.length,
      durationMs: Date.now() - scopeStart,
    },
    'scope and delta files computed',
  );

  // Child meta outputs (parallel reads)
  const childMetas: Record<string, unknown> = {};
  const childEntries = await Promise.all(
    node.children.map(async (child) => {
      const content = await readMetaContent(join(child.metaPath, 'meta.json'));
      return [child.ownerPath, content] as const;
    }),
  );
  for (const [path, content] of childEntries) {
    childMetas[path] = content;
  }

  // Cross-referenced meta outputs (parallel reads)
  const crossRefMetas: Record<string, unknown> = {};
  const seen = new Set<string>();
  const crossRefPaths: string[] = [];
  for (const refPath of meta._crossRefs ?? []) {
    if (refPath === node.ownerPath || refPath === node.metaPath) continue;
    if (seen.has(refPath)) continue;
    seen.add(refPath);
    crossRefPaths.push(refPath);
  }
  const crossRefEntries = await Promise.all(
    crossRefPaths.map(async (refPath) => {
      const content = await readMetaContent(
        join(refPath, '.meta', 'meta.json'),
      );
      return [refPath, content] as const;
    }),
  );
  for (const [path, content] of crossRefEntries) {
    crossRefMetas[path] = content;
  }

  // Archive paths
  const archives = listArchiveFiles(node.metaPath);

  return {
    path: node.metaPath,
    scopeFiles,
    deltaFiles,
    childMetas,
    crossRefMetas,
    previousContent: meta._content ?? null,
    previousFeedback: meta._feedback ?? null,
    steer: meta._steer ?? null,
    previousState: meta._state ?? null,
    archives,
  };
}
