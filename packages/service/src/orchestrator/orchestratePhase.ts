/**
 * Phase-aware orchestration entry point.
 *
 * Replaces the old staleness-based orchestrate() with phase-state-machine
 * scheduling: each tick discovers all metas, computes invalidation,
 * auto-retries failed phases, selects the best phase candidate, and
 * executes exactly one phase.
 *
 * @module orchestrator/orchestratePhase
 */

import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { buildMinimalNode } from '../discovery/buildMinimalNode.js';
import { listMetas } from '../discovery/index.js';
import { getScopeFiles, getScopePrefix } from '../discovery/scope.js';
import type { MetaNode } from '../discovery/types.js';
import type { MetaExecutor, WatcherClient } from '../interfaces/index.js';
import { acquireLock, releaseLock } from '../lock.js';
import type { MinimalLogger } from '../logger/index.js';
import { normalizePath } from '../normalizePath.js';
import {
  buildPhaseCandidates,
  derivePhaseState,
  getOwedPhase,
  retryAllFailed,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import type { ProgressEvent } from '../progress/index.js';
import { readMetaJson } from '../readMetaJson.js';
import { isStale } from '../scheduling/staleness.js';
import type {
  MetaConfig,
  MetaJson,
  PhaseName,
  PhaseState,
} from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import {
  type PhaseResult,
  runArchitect,
  runBuilder,
  runCritic,
} from './runPhase.js';

/** Phase runner dispatch map — avoids repeating the same switch/case. */
const phaseRunners = {
  architect: runArchitect,
  builder: runBuilder,
  critic: runCritic,
} as const;

/** Callback for synthesis progress events. */
export type PhaseProgressCallback = (
  event: ProgressEvent,
) => void | Promise<void>;

/** Result of a single phase-aware orchestration tick. */
export interface OrchestratePhaseResult {
  /** Whether a phase was executed. */
  executed: boolean;
  /** Path to the meta that was selected. */
  metaPath?: string;
  /** Which phase was run. */
  phase?: PhaseName;
  /** The phase result (if executed). */
  phaseResult?: PhaseResult;
  /** Whether a full synthesis cycle completed (all phases fresh). */
  cycleComplete?: boolean;
}

/**
 * Run a single phase-aware orchestration tick.
 *
 * When targetPath is provided (override entry), runs the owed phase for
 * that specific meta. Otherwise, discovers all metas, computes invalidation,
 * and selects the best phase candidate corpus-wide.
 */
export async function orchestratePhase(
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  targetPath?: string,
  onProgress?: PhaseProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestratePhaseResult> {
  // ── Targeted path (override entry) ──
  if (targetPath) {
    return orchestrateTargeted(
      config,
      executor,
      watcher,
      targetPath,
      onProgress,
      logger,
    );
  }

  // ── Corpus-wide discovery + phase selection ──
  let metaResult;
  try {
    metaResult = await listMetas(config, watcher);
  } catch (err) {
    logger?.warn({ err }, 'Failed to list metas for phase selection');
    return { executed: false };
  }

  if (metaResult.entries.length === 0) return { executed: false };

  // Build candidates with phase state (including invalidation + auto-retry)
  const candidates = buildPhaseCandidates(metaResult.entries);

  // Select best phase candidate
  const winner = selectPhaseCandidate(candidates, config.depthWeight);
  if (!winner) {
    return { executed: false };
  }

  // Acquire lock
  if (!acquireLock(winner.node.metaPath)) {
    logger?.debug(
      { path: winner.node.metaPath },
      'Selected candidate is locked, skipping',
    );
    return { executed: false };
  }

  try {
    // Re-read meta under lock for freshness
    const currentMeta = await readMetaJson(winner.node.metaPath);
    const phaseState = retryAllFailed(derivePhaseState(currentMeta));

    const owedPhase = getOwedPhase(phaseState);
    if (!owedPhase || phaseState[owedPhase] !== 'pending') {
      // Nothing to do (race: became fresh between selection and lock)
      return { executed: false };
    }

    // Compute structure hash for the phase
    const { scopeFiles } = await getScopeFiles(winner.node, watcher);
    const structureHash = computeStructureHash(scopeFiles);

    // skipUnchanged: bump _generatedAt without altering _phaseState
    if (config.skipUnchanged && currentMeta._generatedAt) {
      const verifiedStale = await isStale(
        getScopePrefix(winner.node),
        currentMeta,
        watcher,
      );
      if (!verifiedStale) {
        const freshMeta = await readMetaJson(winner.node.metaPath);
        freshMeta._generatedAt = new Date().toISOString();
        const lockPath = join(winner.node.metaPath, '.lock');
        const metaJsonPath = join(winner.node.metaPath, 'meta.json');
        await writeFile(lockPath, JSON.stringify(freshMeta, null, 2) + '\n');
        await copyFile(lockPath, metaJsonPath);
        logger?.debug(
          { path: winner.node.ownerPath },
          'Skipped unchanged meta, bumped _generatedAt',
        );
        return { executed: false };
      }
    }

    return await executePhase(
      winner.node,
      currentMeta,
      phaseState,
      owedPhase,
      config,
      executor,
      watcher,
      structureHash,
      onProgress,
      logger,
    );
  } finally {
    releaseLock(winner.node.metaPath);
  }
}

/**
 * Orchestrate a targeted (override) meta path.
 * Resolves the owed phase at execution time (not enqueue time).
 */
async function orchestrateTargeted(
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  targetPath: string,
  onProgress?: PhaseProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestratePhaseResult> {
  const normalizedTarget = normalizePath(targetPath);
  const node = await buildMinimalNode(normalizedTarget, watcher);

  if (!acquireLock(node.metaPath)) {
    return { executed: false };
  }

  try {
    const currentMeta = await readMetaJson(normalizedTarget);
    const phaseState = retryAllFailed(derivePhaseState(currentMeta));

    const owedPhase = getOwedPhase(phaseState);
    if (!owedPhase) {
      // Fully fresh — override is a no-op (silently dropped per spec)
      return { executed: false, metaPath: normalizedTarget };
    }

    // Compute structure hash
    const { scopeFiles } = await getScopeFiles(node, watcher);
    const structureHash = computeStructureHash(scopeFiles);

    return await executePhase(
      node,
      currentMeta,
      phaseState,
      owedPhase,
      config,
      executor,
      watcher,
      structureHash,
      onProgress,
      logger,
    );
  } finally {
    releaseLock(node.metaPath);
  }
}

/**
 * Execute exactly one phase on a meta.
 */
async function executePhase(
  node: MetaNode,
  currentMeta: MetaJson,
  phaseState: PhaseState,
  phase: PhaseName,
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  structureHash: string,
  onProgress?: PhaseProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestratePhaseResult> {
  const result: PhaseResult = await phaseRunners[phase](
    node,
    currentMeta,
    phaseState,
    config,
    executor,
    watcher,
    structureHash,
    onProgress,
    logger,
  );

  return {
    executed: true,
    metaPath: node.metaPath,
    phase,
    phaseResult: result,
    cycleComplete: result.cycleComplete,
  };
}
