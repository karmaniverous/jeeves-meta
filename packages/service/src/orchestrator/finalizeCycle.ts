/**
 * Lock-staged cycle finalization: write to .lock, copy to meta.json, archive, prune.
 *
 * @module orchestrator/finalizeCycle
 */

import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

import { createSnapshot, pruneArchive } from '../archive/index.js';
import type { MetaConfig, MetaError, MetaJson } from '../schema/index.js';
import { mergeAndWrite } from './merge.js';
import type { BuilderOutput } from './parseOutput.js';

/** Options for finalizeCycle. */
interface FinalizeCycleOptions {
  metaPath: string;
  current: MetaJson;
  config: MetaConfig;
  architect: string;
  builder: string;
  critic: string;
  builderOutput: BuilderOutput | null;
  feedback: string | null;
  structureHash: string;
  synthesisCount: number;
  error: MetaError | null;
  architectTokens?: number;
  builderTokens?: number;
  criticTokens?: number;
  /** Opaque state from builder output. */
  state?: unknown;
  /** When true, preserve _content and _generatedAt from current. */
  stateOnly?: boolean;
}

/** Finalize a cycle using lock staging: write to .lock → copy to meta.json + archive → delete .lock. */
export function finalizeCycle(opts: FinalizeCycleOptions): MetaJson {
  const lockPath = join(opts.metaPath, '.lock');
  const metaJsonPath = join(opts.metaPath, 'meta.json');

  // Stage: write merged result to .lock
  const updated = mergeAndWrite({
    metaPath: opts.metaPath,
    current: opts.current,
    architect: opts.architect,
    builder: opts.builder,
    critic: opts.critic,
    builderOutput: opts.builderOutput,
    feedback: opts.feedback,
    structureHash: opts.structureHash,
    synthesisCount: opts.synthesisCount,
    error: opts.error,
    architectTokens: opts.architectTokens,
    builderTokens: opts.builderTokens,
    criticTokens: opts.criticTokens,
    outputPath: lockPath,
    state: opts.state,
    stateOnly: opts.stateOnly,
  });

  // Commit: copy .lock → meta.json
  copyFileSync(lockPath, metaJsonPath);

  // Archive + prune from the committed meta.json
  createSnapshot(opts.metaPath, updated);
  pruneArchive(opts.metaPath, opts.config.maxArchive);

  // .lock is cleaned up by the finally block (releaseLock)
  return updated;
}
