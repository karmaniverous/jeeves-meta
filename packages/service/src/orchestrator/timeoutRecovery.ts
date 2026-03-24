/**
 * Timeout recovery — salvage partial builder state after a SpawnTimeoutError.
 *
 * @module orchestrator/timeoutRecovery
 */

import { readFile } from 'node:fs/promises';

import type { SpawnTimeoutError } from '../executor/index.js';
import type { MetaConfig, MetaError, MetaJson } from '../schema/index.js';
import { finalizeCycle } from './finalizeCycle.js';
import type { OrchestrateResult } from './orchestrate.js';
import { parseBuilderOutput } from './parseOutput.js';

/** Options for attempting timeout recovery. */
interface TimeoutRecoveryOptions {
  err: SpawnTimeoutError;
  currentMeta: MetaJson;
  metaPath: string;
  config: MetaConfig;
  builderBrief: string;
  structureHash: string;
  synthesisCount: number;
}

/**
 * Attempt to recover partial state from a timed-out builder spawn.
 *
 * Returns an {@link OrchestrateResult} if state was salvaged, or `null`
 * if the caller should fall through to a hard failure.
 */
export async function attemptTimeoutRecovery(
  opts: TimeoutRecoveryOptions,
): Promise<OrchestrateResult | null> {
  const {
    err,
    currentMeta,
    metaPath,
    config,
    builderBrief,
    structureHash,
    synthesisCount,
  } = opts;

  let partialOutput: ReturnType<typeof parseBuilderOutput> | null = null;
  try {
    const raw = await readFile(err.outputPath, 'utf8');
    partialOutput = parseBuilderOutput(raw);
  } catch {
    // Could not read partial output — fall through to hard failure
  }

  if (partialOutput?.state !== undefined) {
    const currentState = JSON.stringify(currentMeta._state);
    const newState = JSON.stringify(partialOutput.state);

    if (newState !== currentState) {
      const timeoutError: MetaError = {
        step: 'builder',
        code: 'TIMEOUT',
        message: err.message,
      };
      await finalizeCycle({
        metaPath,
        current: currentMeta,
        config,
        architect: currentMeta._architect ?? '',
        builder: builderBrief,
        critic: currentMeta._critic ?? '',
        builderOutput: null,
        feedback: null,
        structureHash,
        synthesisCount,
        error: timeoutError,
        state: partialOutput.state,
        stateOnly: true,
      });
      return {
        synthesized: true,
        metaPath,
        error: timeoutError,
      };
    }
  }

  return null;
}
