/**
 * Main orchestration function — the 13-step synthesis cycle.
 *
 * Wires together discovery, scheduling, archiving, executor calls,
 * and merge/write-back.
 *
 * @module orchestrator/orchestrate
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createSnapshot,
  pruneArchive,
  readLatestArchive,
} from '../archive/index.js';
import {
  buildOwnershipTree,
  ensureMetaJson,
  globMetas,
} from '../discovery/index.js';
import { getScopePrefix } from '../discovery/scope.js';
import type { SynthExecutor, WatcherClient } from '../interfaces/index.js';
import { acquireLock, releaseLock } from '../lock.js';
import {
  actualStaleness,
  computeEffectiveStaleness,
  selectCandidate,
} from '../scheduling/index.js';
import type { MetaJson, SynthConfig, SynthError } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
import { buildContextPackage } from './contextPackage.js';
import { mergeAndWrite } from './merge.js';
import {
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';

/** Result of a single orchestration cycle. */
export interface OrchestrateResult {
  /** Whether a synthesis was performed. */
  synthesized: boolean;
  /** Path to the meta that was synthesized, if any. */
  metaPath?: string;
  /** Error if synthesis failed. */
  error?: SynthError;
}

/**
 * Run a single synthesis cycle.
 *
 * Discovers all metas, selects the stalest candidate, and runs the
 * three-step synthesis (architect, builder, critic).
 *
 * @param config - Validated synthesis config.
 * @param executor - Pluggable LLM executor.
 * @param watcher - Watcher HTTP client.
 * @returns Result indicating whether synthesis occurred.
 */
export async function orchestrate(
  config: SynthConfig,
  executor: SynthExecutor,
  watcher: WatcherClient,
): Promise<OrchestrateResult> {
  // Step 1: Discover
  const metaPaths = globMetas(config.watchPaths);
  if (metaPaths.length === 0) return { synthesized: false };

  // Ensure all meta.json files exist
  const metas = new Map<string, MetaJson>();
  for (const mp of metaPaths) {
    metas.set(mp, ensureMetaJson(mp));
  }

  const tree = buildOwnershipTree(metaPaths);

  // Step 3-4: Staleness check + candidate selection
  const candidates = [];
  for (const node of tree.nodes.values()) {
    const meta = metas.get(node.metaPath)!;
    const staleness = actualStaleness(meta);
    if (staleness > 0) {
      candidates.push({ node, meta, actualStaleness: staleness });
    }
  }

  const weighted = computeEffectiveStaleness(candidates, config.depthWeight);
  const winner = selectCandidate(weighted);
  if (!winner) return { synthesized: false };

  const { node } = winner;

  // Step 2: Acquire lock
  if (!acquireLock(node.metaPath)) {
    return { synthesized: false }; // Locked by another process
  }

  try {
    // Re-read meta after lock (may have changed)
    const currentMeta = JSON.parse(
      readFileSync(join(node.metaPath, 'meta.json'), 'utf8'),
    ) as MetaJson;

    // Step 5: Structure hash
    const scopePrefix = getScopePrefix(node);
    const scanResult = await watcher.scan({ pathPrefix: scopePrefix });
    const scopeFiles = scanResult.files.map((f) => f.file_path);
    const newStructureHash = computeStructureHash(scopeFiles);
    const structureChanged = newStructureHash !== currentMeta._structureHash;

    // Step 6: Steer change detection
    const latestArchive = readLatestArchive(node.metaPath);
    const steerChanged = latestArchive
      ? currentMeta._steer !== latestArchive._steer
      : Boolean(currentMeta._steer);

    // Step 7: Compute context
    const ctx = await buildContextPackage(node, currentMeta, watcher);

    // Step 8: Architect
    const architectTriggered =
      !currentMeta._builder ||
      structureChanged ||
      steerChanged ||
      (currentMeta._synthesisCount ?? 0) >= config.architectEvery;

    let builderBrief = currentMeta._builder ?? '';
    let synthesisCount = currentMeta._synthesisCount ?? 0;
    let stepError: SynthError | null = null;

    if (architectTriggered) {
      try {
        const architectTask = buildArchitectTask(ctx, currentMeta, config);
        const architectOutput = await executor.spawn(architectTask, {
          timeout: config.architectTimeout,
        });
        builderBrief = parseArchitectOutput(architectOutput);
        synthesisCount = 0;
      } catch (err) {
        if (!currentMeta._builder) {
          // First run with no cached builder — cycle fails
          stepError = {
            step: 'architect',
            code: 'FAILED',
            message: err instanceof Error ? err.message : String(err),
          };
          mergeAndWrite({
            metaPath: node.metaPath,
            current: currentMeta,
            architect: currentMeta._architect ?? config.defaultArchitect,
            builder: '',
            critic: currentMeta._critic ?? config.defaultCritic,
            builderOutput: null,
            feedback: null,
            structureHash: newStructureHash,
            synthesisCount,
            error: stepError,
          });
          createSnapshot(node.metaPath, currentMeta);
          pruneArchive(node.metaPath, config.maxArchive);
          return {
            synthesized: true,
            metaPath: node.metaPath,
            error: stepError,
          };
        }
        // Has cached builder — continue with existing
        stepError = {
          step: 'architect',
          code: 'FAILED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // Update meta with new builder brief for the builder task
    const metaForBuilder: MetaJson = { ...currentMeta, _builder: builderBrief };

    // Step 9: Builder
    let builderOutput = null;
    try {
      const builderTask = buildBuilderTask(ctx, metaForBuilder, config);
      const builderRaw = await executor.spawn(builderTask, {
        timeout: config.builderTimeout,
      });
      builderOutput = parseBuilderOutput(builderRaw);
      synthesisCount++;
    } catch (err) {
      // Builder failed — don't update meta
      stepError = {
        step: 'builder',
        code: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
      };
      return { synthesized: true, metaPath: node.metaPath, error: stepError };
    }

    // Step 10: Critic
    const metaForCritic: MetaJson = {
      ...currentMeta,
      _content: builderOutput.content,
    };
    let feedback: string | null = null;
    try {
      const criticTask = buildCriticTask(ctx, metaForCritic, config);
      const criticRaw = await executor.spawn(criticTask, {
        timeout: config.criticTimeout,
      });
      feedback = parseCriticOutput(criticRaw);
      stepError = null; // Clear any architect error on full success
    } catch (err) {
      // Critic failed — write content without feedback
      stepError = stepError ?? {
        step: 'critic',
        code: 'FAILED',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    // Step 11: Merge & write
    const updatedMeta = mergeAndWrite({
      metaPath: node.metaPath,
      current: currentMeta,
      architect: currentMeta._architect ?? config.defaultArchitect,
      builder: builderBrief,
      critic: currentMeta._critic ?? config.defaultCritic,
      builderOutput,
      feedback,
      structureHash: newStructureHash,
      synthesisCount,
      error: stepError,
    });

    // Step 12: Archive
    createSnapshot(node.metaPath, updatedMeta);
    pruneArchive(node.metaPath, config.maxArchive);

    return {
      synthesized: true,
      metaPath: node.metaPath,
      error: stepError ?? undefined,
    };
  } finally {
    // Step 13: Release lock
    releaseLock(node.metaPath);
  }
}
