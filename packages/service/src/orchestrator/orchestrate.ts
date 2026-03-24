/**
 * Main orchestration entry point — discovery, scheduling, candidate selection.
 *
 * @module orchestrator/orchestrate
 */

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildMinimalNode } from '../discovery/buildMinimalNode.js';
import { discoverMetas } from '../discovery/discoverMetas.js';
import { buildOwnershipTree } from '../discovery/index.js';
import { getScopePrefix } from '../discovery/scope.js';
import type { MetaExecutor, WatcherClient } from '../interfaces/index.js';
import { acquireLock, releaseLock } from '../lock.js';
import type { MinimalLogger } from '../logger/index.js';
import { normalizePath } from '../normalizePath.js';
import type { ProgressEvent } from '../progress/index.js';
import { readMetaJson } from '../readMetaJson.js';
import {
  actualStaleness,
  computeEffectiveStaleness,
  isStale,
} from '../scheduling/index.js';
import type { MetaConfig, MetaError, MetaJson } from '../schema/index.js';
import { synthesizeNode } from './synthesizeNode.js';

/** Callback for synthesis progress events. */
export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;

/** Result of a single orchestration cycle. */
export interface OrchestrateResult {
  /** Whether a synthesis was performed. */
  synthesized: boolean;
  /** Path to the meta that was synthesized, if any. */
  metaPath?: string;
  /** Error if synthesis failed. */
  error?: MetaError;
}

async function orchestrateOnce(
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  targetPath?: string,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestrateResult> {
  // When targetPath is provided, skip the expensive full discovery scan.
  // Build a minimal node from the filesystem instead.
  if (targetPath) {
    const normalizedTarget = normalizePath(targetPath);
    const targetMetaJson = join(normalizedTarget, 'meta.json');
    if (!existsSync(targetMetaJson)) return { synthesized: false };

    const node = await buildMinimalNode(normalizedTarget, watcher);
    if (!acquireLock(node.metaPath)) return { synthesized: false };

    try {
      const currentMeta = await readMetaJson(normalizedTarget);

      return await synthesizeNode(
        node,
        currentMeta,
        config,
        executor,
        watcher,
        onProgress,
        logger,
      );
    } finally {
      releaseLock(node.metaPath);
    }
  }

  // Full discovery path (scheduler-driven, no specific target)
  // Step 1: Discover via watcher walk
  const discoveryStart = Date.now();
  const metaPaths = await discoverMetas(watcher);
  logger?.debug(
    { paths: metaPaths.length, durationMs: Date.now() - discoveryStart },
    'discovery complete',
  );
  if (metaPaths.length === 0) return { synthesized: false };

  // Read meta.json for each discovered meta
  const metas = new Map<string, MetaJson>();
  for (const mp of metaPaths) {
    try {
      metas.set(normalizePath(mp), await readMetaJson(mp));
    } catch {
      // Skip metas with unreadable meta.json
      continue;
    }
  }

  // Only build tree from paths with readable meta.json (excludes orphaned/deleted entries)
  const validPaths = metaPaths.filter((mp) => metas.has(normalizePath(mp)));
  if (validPaths.length === 0) return { synthesized: false };

  const tree = buildOwnershipTree(validPaths);

  // Steps 3-4: Staleness check + candidate selection
  const candidates = [];
  for (const treeNode of tree.nodes.values()) {
    const meta = metas.get(treeNode.metaPath);
    if (!meta) continue;
    const staleness = actualStaleness(meta);
    if (staleness > 0) {
      candidates.push({ node: treeNode, meta, actualStaleness: staleness });
    }
  }

  const weighted = computeEffectiveStaleness(candidates, config.depthWeight);

  // Sort by effective staleness descending
  const ranked = [...weighted].sort(
    (a, b) => b.effectiveStaleness - a.effectiveStaleness,
  );
  if (ranked.length === 0) return { synthesized: false };

  // Find the first candidate with actual changes (if skipUnchanged)
  let winner: (typeof ranked)[0] | null = null;
  for (const candidate of ranked) {
    if (!acquireLock(candidate.node.metaPath)) continue;

    const verifiedStale = await isStale(
      getScopePrefix(candidate.node),
      candidate.meta,
      watcher,
    );

    if (!verifiedStale && candidate.meta._generatedAt) {
      // Bump _generatedAt so it doesn't win next cycle
      const freshMeta = await readMetaJson(candidate.node.metaPath);
      freshMeta._generatedAt = new Date().toISOString();
      await writeFile(
        join(candidate.node.metaPath, 'meta.json'),
        JSON.stringify(freshMeta, null, 2),
      );
      releaseLock(candidate.node.metaPath);

      if (config.skipUnchanged) continue;
      return { synthesized: false };
    }

    winner = candidate;
    break;
  }

  if (!winner) return { synthesized: false };
  const node = winner.node;

  try {
    const currentMeta = await readMetaJson(node.metaPath);

    return await synthesizeNode(
      node,
      currentMeta,
      config,
      executor,
      watcher,
      onProgress,
      logger,
    );
  } finally {
    // Step 13: Release lock
    releaseLock(node.metaPath);
  }
}

/**
 * Run a single synthesis cycle.
 *
 * Selects the stalest candidate (or a specific target) and runs the
 * full architect/builder/critic pipeline.
 *
 * @param config - Validated synthesis config.
 * @param executor - Pluggable LLM executor.
 * @param watcher - Watcher HTTP client.
 * @param targetPath - Optional: specific meta/owner path to synthesize instead of stalest candidate.
 * @returns Array with a single result.
 */
export async function orchestrate(
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  targetPath?: string,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestrateResult[]> {
  const result = await orchestrateOnce(
    config,
    executor,
    watcher,
    targetPath,
    onProgress,
    logger,
  );
  return [result];
}
