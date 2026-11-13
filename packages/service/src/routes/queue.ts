/**
 * Queue management and abort handlers.
 *
 * - GET /queue — 3-layer queue model (current, pending, automatic)
 * - POST /queue/clear — remove pending entries
 * - POST /synthesize/abort — abort the current synthesis
 *
 * @module routes/queue
 */

import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PhaseName } from '@karmaniverous/jeeves-meta-core';

import type { MetaHandlers } from '../api/handlerTypes.js';
import { finiteOrNull } from '../finiteOrNull.js';
import { releaseLock, resolveMetaDir } from '../lock.js';
import {
  buildPhaseCandidates,
  derivePhaseState,
  getOwedPhase,
  phaseFailed,
  rankPhaseCandidates,
} from '../phaseState/index.js';
import { readMetaJson } from '../readMetaJson.js';
import type { RouteDeps } from './index.js';

/**
 * The `queue`, `queueClear` and `abort` handlers.
 *
 * @param deps - Route dependencies.
 * @returns The handlers.
 */
export function createQueueHandlers(
  deps: RouteDeps,
): Pick<MetaHandlers, 'queue' | 'queueClear' | 'abort'> {
  const { queue } = deps;

  const listQueue = async () => {
    const currentPhase = queue.currentPhase;
    const pending = queue.items;

    // Compute owedPhase for each pending entry by reading meta state
    const enrichedPending = await Promise.all(
      pending.map(async (entry) => {
        try {
          const metaDir = resolveMetaDir(entry.path);
          const meta = await readMetaJson(metaDir);
          const ps = derivePhaseState(meta);
          return {
            path: entry.path,
            owedPhase: getOwedPhase(ps),
            enqueuedAt: entry.enqueuedAt,
          };
        } catch {
          return {
            path: entry.path,
            owedPhase: null,
            enqueuedAt: entry.enqueuedAt,
          };
        }
      }),
    );

    // Compute automatic layer: all metas with a pending owed phase,
    // ranked by scheduler priority (computed on read, not persisted)
    let automatic: Array<{
      path: string;
      owedPhase: PhaseName;
      priorityBand: number;
      effectiveStaleness: number | null;
    }> = [];
    try {
      const metaResult = await deps.cache.get(deps.config, deps.watcher);
      const candidates = buildPhaseCandidates(
        metaResult.entries,
        deps.config.architectEvery,
      );
      const ranked = rankPhaseCandidates(candidates, deps.config.depthWeight);
      automatic = ranked.map((c) => ({
        path: c.node.metaPath,
        owedPhase: c.owedPhase,
        priorityBand: c.band,
        effectiveStaleness: finiteOrNull(c.effectiveStaleness),
      }));
    } catch {
      // If listing fails, automatic stays empty
    }

    return {
      current: currentPhase
        ? {
            path: currentPhase.path,
            phase: currentPhase.phase,
            startedAt: currentPhase.startedAt,
          }
        : null,
      pending: enrichedPending,
      automatic,
    };
  };

  const abort = async () => {
    const currentPhase = queue.currentPhase;

    if (!currentPhase) return { status: 'idle' as const };

    // Abort the executor
    deps.executor?.abort();

    const metaDir = resolveMetaDir(currentPhase.path);
    const { phase } = currentPhase;

    // Transition running phase to failed and write _error to meta.json
    try {
      const meta = await readMetaJson(metaDir);
      let ps = derivePhaseState(meta);
      ps = phaseFailed(ps, phase);

      const updated = {
        ...meta,
        _phaseState: ps,
        _error: {
          step: phase,
          code: 'ABORT',
          message: 'Aborted by operator',
        },
      };

      const lockPath = join(metaDir, '.lock');
      const metaJsonPath = join(metaDir, 'meta.json');
      await writeFile(lockPath, JSON.stringify(updated, null, 2) + '\n');
      await copyFile(lockPath, metaJsonPath);
    } catch {
      // Best-effort — meta may be unreadable
    }

    // Release the lock for the current meta path
    try {
      releaseLock(metaDir);
    } catch {
      // Lock may already be released
    }

    deps.logger.info({ path: currentPhase.path }, 'Synthesis aborted');

    return {
      status: 'aborted' as const,
      path: currentPhase.path,
      phase,
    };
  };

  return {
    queue: async () => ({ status: 200, body: await listQueue() }),
    queueClear: () =>
      Promise.resolve({ status: 200, body: { cleared: queue.clear() } }),
    abort: async () => ({ status: 200, body: await abort() }),
  };
}
