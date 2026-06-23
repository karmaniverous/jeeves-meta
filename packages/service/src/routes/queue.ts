/**
 * Queue management and abort routes.
 *
 * - GET /queue — 3-layer queue model (current, pending, automatic)
 * - POST /queue/clear — remove pending entries
 * - POST /synthesize/abort — abort the current synthesis
 *
 * @module routes/queue
 */

import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getEndpoint } from '@karmaniverous/jeeves-meta-core';
import type { FastifyInstance } from 'fastify';

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

/** Register queue management routes. */
export function registerQueueRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  const { queue } = deps;

  app.get(getEndpoint('queue').path, async () => {
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
            owedPhase: null as string | null,
            enqueuedAt: entry.enqueuedAt,
          };
        }
      }),
    );

    // Compute automatic layer: all metas with a pending owed phase,
    // ranked by scheduler priority (computed on read, not persisted)
    let automatic: Array<{
      path: string;
      owedPhase: string;
      priorityBand: number;
      effectiveStaleness: number;
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
        effectiveStaleness: c.effectiveStaleness,
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
  });

  app.post(getEndpoint('queueClear').path, () => {
    const removed = queue.clear();
    return { cleared: removed };
  });

  app.post(getEndpoint('abort').path, async (_request, reply) => {
    const currentPhase = queue.currentPhase;

    if (!currentPhase) {
      return reply.status(200).send({ status: 'idle' });
    }

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
      status: 'aborted',
      path: currentPhase.path,
      phase,
    };
  });
}
