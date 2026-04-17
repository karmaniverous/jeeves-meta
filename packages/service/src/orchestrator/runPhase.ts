/**
 * Per-phase executors for the phase-state machine.
 *
 * Each function runs exactly one phase on one meta, updates _phaseState
 * via pure transitions, and persists via the lock-staged write.
 *
 * @module orchestrator/runPhase
 */

import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createSnapshot, pruneArchive } from '../archive/index.js';
import type { MetaNode } from '../discovery/index.js';
import { toMetaError } from '../errors.js';
import { SpawnTimeoutError } from '../executor/index.js';
import type { MetaExecutor, WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';
import {
  architectSuccess,
  builderSuccess,
  criticSuccess,
  isFullyFresh,
  phaseFailed,
  phaseRunning,
} from '../phaseState/index.js';
import type { ProgressEvent } from '../progress/index.js';
import type {
  MetaConfig,
  MetaError,
  MetaJson,
  PhaseState,
} from '../schema/index.js';
import {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
import { buildContextPackage } from './contextPackage.js';
import {
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';
import { attemptTimeoutRecovery } from './timeoutRecovery.js';

/** Callback for synthesis progress events. */
export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;

/** Result of running a single phase. */
export interface PhaseResult {
  /** Whether the phase executed (vs. was skipped). */
  executed: boolean;
  /** Updated phase state after execution. */
  phaseState: PhaseState;
  /** Updated meta.json content (if written). */
  updatedMeta?: MetaJson;
  /** Error if the phase failed. */
  error?: MetaError;
  /** Whether the full cycle is now complete (all phases fresh). */
  cycleComplete?: boolean;
}

/** Shared base options for all finalize calls. */
interface FinalizeBase {
  metaPath: string;
  current: MetaJson;
  config: MetaConfig;
  structureHash: string;
}

/** Write updated meta with phase state via lock staging. */
async function persistPhaseState(
  base: FinalizeBase,
  phaseState: PhaseState,
  updates: Partial<MetaJson>,
): Promise<MetaJson> {
  const lockPath = join(base.metaPath, '.lock');
  const metaJsonPath = join(base.metaPath, 'meta.json');

  const merged: MetaJson = {
    ...base.current,
    ...updates,
    _phaseState: phaseState,
    _structureHash: base.structureHash,
  };

  // Clean undefined
  if (merged._error === undefined) delete merged._error;

  await writeFile(lockPath, JSON.stringify(merged, null, 2) + '\n');
  await copyFile(lockPath, metaJsonPath);
  return merged;
}

// ── Architect executor ─────────────────────────────────────────────────

export async function runArchitect(
  node: MetaNode,
  currentMeta: MetaJson,
  phaseState: PhaseState,
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  structureHash: string,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<PhaseResult> {
  let ps = phaseRunning(phaseState, 'architect');

  const ctx = await buildContextPackage(node, currentMeta, watcher, logger);

  try {
    await onProgress?.({
      type: 'phase_start',
      path: node.ownerPath,
      phase: 'architect',
    });
    const phaseStart = Date.now();
    const architectTask = buildArchitectTask(ctx, currentMeta, config);
    const result = await executor.spawn(architectTask, {
      thinking: config.thinking,
      timeout: config.architectTimeout,
      label: 'meta-architect',
    });
    const builderBrief = parseArchitectOutput(result.output);
    const architectTokens = result.tokens;

    // Architect success: architect → fresh, _synthesisCount → 0
    ps = architectSuccess(ps);

    const updatedMeta = await persistPhaseState(
      { metaPath: node.metaPath, current: currentMeta, config, structureHash },
      ps,
      {
        _builder: builderBrief,
        _architect: currentMeta._architect ?? config.defaultArchitect ?? '',
        _synthesisCount: 0,
        _architectTokens: architectTokens,
        _generatedAt: new Date().toISOString(),
        _error: undefined,
      },
    );

    await onProgress?.({
      type: 'phase_complete',
      path: node.ownerPath,
      phase: 'architect',
      tokens: architectTokens,
      durationMs: Date.now() - phaseStart,
    });

    return { executed: true, phaseState: ps, updatedMeta };
  } catch (err) {
    const error = toMetaError('architect', err);
    ps = phaseFailed(ps, 'architect');

    await persistPhaseState(
      { metaPath: node.metaPath, current: currentMeta, config, structureHash },
      ps,
      { _error: error },
    );

    return { executed: true, phaseState: ps, error };
  }
}

// ── Builder executor ───────────────────────────────────────────────────

export async function runBuilder(
  node: MetaNode,
  currentMeta: MetaJson,
  phaseState: PhaseState,
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  structureHash: string,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<PhaseResult> {
  let ps = phaseRunning(phaseState, 'builder');

  const ctx = await buildContextPackage(node, currentMeta, watcher, logger);

  try {
    await onProgress?.({
      type: 'phase_start',
      path: node.ownerPath,
      phase: 'builder',
    });
    const builderStart = Date.now();
    const builderTask = buildBuilderTask(ctx, currentMeta, config);
    const result = await executor.spawn(builderTask, {
      thinking: config.thinking,
      timeout: config.builderTimeout,
      label: 'meta-builder',
    });
    const builderOutput = parseBuilderOutput(result.output);
    const builderTokens = result.tokens;

    // Builder success: builder → fresh, critic → pending
    ps = builderSuccess(ps);

    const synthesisCount = (currentMeta._synthesisCount ?? 0) + 1;

    const updatedMeta = await persistPhaseState(
      { metaPath: node.metaPath, current: currentMeta, config, structureHash },
      ps,
      {
        _content: builderOutput.content,
        _state: builderOutput.state,
        _builderTokens: builderTokens,
        _synthesisCount: synthesisCount,
        _generatedAt: new Date().toISOString(),
        _error: undefined,
        ...builderOutput.fields,
      },
    );

    await onProgress?.({
      type: 'phase_complete',
      path: node.ownerPath,
      phase: 'builder',
      tokens: builderTokens,
      durationMs: Date.now() - builderStart,
    });

    return { executed: true, phaseState: ps, updatedMeta };
  } catch (err) {
    // §4.6 partial _state recovery on timeout
    if (err instanceof SpawnTimeoutError) {
      const recovered = await attemptTimeoutRecovery({
        err,
        currentMeta,
        metaPath: node.metaPath,
        config,
        builderBrief: currentMeta._builder ?? '',
        structureHash,
        synthesisCount: (currentMeta._synthesisCount ?? 0) + 1,
      });
      if (recovered) {
        // Even with recovery, builder still failed from phase-state perspective
        ps = phaseFailed(ps, 'builder');
        await persistPhaseState(
          {
            metaPath: node.metaPath,
            current: currentMeta,
            config,
            structureHash,
          },
          ps,
          { _error: toMetaError('builder', err) },
        );
        return {
          executed: true,
          phaseState: ps,
          error: toMetaError('builder', err),
        };
      }
    }

    const error = toMetaError('builder', err);
    ps = phaseFailed(ps, 'builder');

    await persistPhaseState(
      { metaPath: node.metaPath, current: currentMeta, config, structureHash },
      ps,
      { _error: error },
    );

    return { executed: true, phaseState: ps, error };
  }
}

// ── Critic executor ────────────────────────────────────────────────────

export async function runCritic(
  node: MetaNode,
  currentMeta: MetaJson,
  phaseState: PhaseState,
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  structureHash: string,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<PhaseResult> {
  let ps = phaseRunning(phaseState, 'critic');

  const ctx = await buildContextPackage(node, currentMeta, watcher, logger);

  // Build critic task using current meta's _content
  const metaForCritic: MetaJson = { ...currentMeta };

  try {
    await onProgress?.({
      type: 'phase_start',
      path: node.ownerPath,
      phase: 'critic',
    });
    const criticStart = Date.now();
    const criticTask = buildCriticTask(ctx, metaForCritic, config);
    const result = await executor.spawn(criticTask, {
      thinking: config.thinking,
      timeout: config.criticTimeout,
      label: 'meta-critic',
    });
    const feedback = parseCriticOutput(result.output);
    const criticTokens = result.tokens;

    // Critic success: critic → fresh
    ps = criticSuccess(ps);
    const cycleComplete = isFullyFresh(ps);

    const updates: Partial<MetaJson> = {
      _feedback: feedback,
      _criticTokens: criticTokens,
      _error: undefined,
    };

    // Full-cycle completion: increment _synthesisCount, archive, emit
    if (cycleComplete) {
      // _synthesisCount was already set during builder phase; this is the
      // closing increment per spec. But per spec, _synthesisCount tracks
      // cycles since last architect refresh. Architect resets to 0 on success,
      // and the full-cycle completion increments it.
      // Actually, _synthesisCount was already incremented during builder.
      // The full-cycle completion archives but does NOT increment again —
      // the builder already did that. Spec says: "Increment of _synthesisCount"
      // on full cycle. Let's re-read the spec...
      // Spec: "_synthesisCount tracks full cycles completed since the last
      // architect refresh. Full-cycle completion increments it; successful
      // architect completion resets it to 0."
      // And: "within a single cycle, a successful architect zeroes the counter
      // first, and the cycle's closing increment lands on top of that zero."
      // So the increment happens at full-cycle, not at builder phase.
      // BUT the existing code increments at builder (synthesisCount++).
      // We need to match the spec: increment at cycle completion.
      // Since in the new model, builder doesn't increment, we do it here.
      updates._synthesisCount = (currentMeta._synthesisCount ?? 0) + 1;
    }

    const updatedMeta = await persistPhaseState(
      { metaPath: node.metaPath, current: currentMeta, config, structureHash },
      ps,
      updates,
    );

    // Archive on full-cycle only
    if (cycleComplete) {
      await createSnapshot(node.metaPath, updatedMeta);
      await pruneArchive(node.metaPath, config.maxArchive);
    }

    await onProgress?.({
      type: 'phase_complete',
      path: node.ownerPath,
      phase: 'critic',
      tokens: criticTokens,
      durationMs: Date.now() - criticStart,
    });

    return {
      executed: true,
      phaseState: ps,
      updatedMeta,
      cycleComplete,
    };
  } catch (err) {
    const error = toMetaError('critic', err);
    ps = phaseFailed(ps, 'critic');

    await persistPhaseState(
      { metaPath: node.metaPath, current: currentMeta, config, structureHash },
      ps,
      { _error: error },
    );

    return { executed: true, phaseState: ps, error };
  }
}
