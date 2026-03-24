/**
 * Single-node synthesis pipeline — architect, builder, critic.
 *
 * @module orchestrator/synthesizeNode
 */

import { readLatestArchive } from '../archive/index.js';
import type { MetaNode } from '../discovery/index.js';
import { toMetaError } from '../errors.js';
import { SpawnTimeoutError } from '../executor/index.js';
import type { MetaExecutor, WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';
import { hasSteerChanged, isArchitectTriggered } from '../scheduling/index.js';
import type { MetaConfig, MetaError, MetaJson } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
import { buildContextPackage } from './contextPackage.js';
import { finalizeCycle } from './finalizeCycle.js';
import type { OrchestrateResult, ProgressCallback } from './orchestrate.js';
import type { BuilderOutput } from './parseOutput.js';
import {
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';
import { attemptTimeoutRecovery } from './timeoutRecovery.js';

/** Run the architect/builder/critic pipeline on a single node. */
export async function synthesizeNode(
  node: MetaNode,
  currentMeta: MetaJson,
  config: MetaConfig,
  executor: MetaExecutor,
  watcher: WatcherClient,
  onProgress?: ProgressCallback,
  logger?: MinimalLogger,
): Promise<OrchestrateResult> {
  // Step 5-6: Steer change detection
  const latestArchive = await readLatestArchive(node.metaPath);
  const steerChanged = hasSteerChanged(
    currentMeta._steer,
    latestArchive?._steer,
    Boolean(latestArchive),
  );

  // Step 7: Compute context (includes scope files and delta files)
  const ctx = await buildContextPackage(node, currentMeta, watcher, logger);

  // Step 5 (deferred): Structure hash from context scope files
  const newStructureHash = computeStructureHash(ctx.scopeFiles);
  const structureChanged = newStructureHash !== currentMeta._structureHash;

  // Step 8: Architect (conditional)
  const architectTriggered = isArchitectTriggered(
    currentMeta,
    structureChanged,
    steerChanged,
    config.architectEvery,
  );

  let builderBrief = currentMeta._builder ?? '';
  let synthesisCount = currentMeta._synthesisCount ?? 0;
  let stepError: MetaError | null = null;
  let architectTokens: number | undefined;
  let builderTokens: number | undefined;
  let criticTokens: number | undefined;

  // Shared base options for all finalizeCycle calls.
  // Note: synthesisCount is excluded because it mutates during the pipeline.
  const baseFinalizeOptions = {
    metaPath: node.metaPath,
    current: currentMeta,
    config,
    architect: currentMeta._architect ?? '',
    critic: currentMeta._critic ?? '',
    structureHash: newStructureHash,
  };

  if (architectTriggered) {
    try {
      await onProgress?.({
        type: 'phase_start',
        path: node.ownerPath,
        phase: 'architect',
      });
      const phaseStart = Date.now();
      const architectTask = buildArchitectTask(ctx, currentMeta, config);
      const architectResult = await executor.spawn(architectTask, {
        thinking: config.thinking,
        timeout: config.architectTimeout,
      });
      builderBrief = parseArchitectOutput(architectResult.output);
      architectTokens = architectResult.tokens;
      synthesisCount = 0;
      await onProgress?.({
        type: 'phase_complete',
        path: node.ownerPath,
        phase: 'architect',
        tokens: architectTokens,
        durationMs: Date.now() - phaseStart,
      });
    } catch (err) {
      stepError = toMetaError('architect', err);

      if (!currentMeta._builder) {
        // No cached builder — cycle fails
        await finalizeCycle({
          ...baseFinalizeOptions,
          builder: '',
          builderOutput: null,
          feedback: null,
          synthesisCount,
          error: stepError,
          architectTokens,
        });
        return {
          synthesized: true,
          metaPath: node.metaPath,
          error: stepError,
        };
      }
      // Has cached builder — continue with existing
    }
  }

  // Step 9: Builder
  const metaForBuilder: MetaJson = { ...currentMeta, _builder: builderBrief };
  let builderOutput: BuilderOutput | null = null;
  try {
    await onProgress?.({
      type: 'phase_start',
      path: node.ownerPath,
      phase: 'builder',
    });
    const builderStart = Date.now();
    const builderTask = buildBuilderTask(ctx, metaForBuilder, config);
    const builderResult = await executor.spawn(builderTask, {
      thinking: config.thinking,
      timeout: config.builderTimeout,
    });
    builderOutput = parseBuilderOutput(builderResult.output);
    builderTokens = builderResult.tokens;
    synthesisCount++;
    await onProgress?.({
      type: 'phase_complete',
      path: node.ownerPath,
      phase: 'builder',
      tokens: builderTokens,
      durationMs: Date.now() - builderStart,
    });
  } catch (err) {
    if (err instanceof SpawnTimeoutError) {
      const recovered = await attemptTimeoutRecovery({
        err,
        currentMeta,
        metaPath: node.metaPath,
        config,
        builderBrief,
        structureHash: newStructureHash,
        synthesisCount,
      });
      if (recovered) return recovered;
    }

    stepError = toMetaError('builder', err);
    await finalizeCycle({
      ...baseFinalizeOptions,
      builder: builderBrief,
      builderOutput: null,
      feedback: null,
      synthesisCount,
      error: stepError,
    });
    return { synthesized: true, metaPath: node.metaPath, error: stepError };
  }

  // Step 10: Critic
  const metaForCritic: MetaJson = {
    ...currentMeta,
    _content: builderOutput.content,
  };
  let feedback: string | null = null;
  try {
    await onProgress?.({
      type: 'phase_start',
      path: node.ownerPath,
      phase: 'critic',
    });
    const criticStart = Date.now();
    const criticTask = buildCriticTask(ctx, metaForCritic, config);
    const criticResult = await executor.spawn(criticTask, {
      thinking: config.thinking,
      timeout: config.criticTimeout,
    });
    feedback = parseCriticOutput(criticResult.output);
    criticTokens = criticResult.tokens;
    stepError = null; // Clear any architect error on full success
    await onProgress?.({
      type: 'phase_complete',
      path: node.ownerPath,
      phase: 'critic',
      tokens: criticTokens,
      durationMs: Date.now() - criticStart,
    });
  } catch (err) {
    stepError = stepError ?? toMetaError('critic', err);
  }

  // Steps 11-12: Merge, archive, prune
  await finalizeCycle({
    ...baseFinalizeOptions,
    builder: builderBrief,
    builderOutput,
    feedback,
    synthesisCount,
    error: stepError,
    architectTokens,
    builderTokens,
    criticTokens,
    state: builderOutput.state,
  });

  return {
    synthesized: true,
    metaPath: node.metaPath,
    error: stepError ?? undefined,
  };
}
