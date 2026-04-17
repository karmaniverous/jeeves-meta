/**
 * Queue management and abort routes.
 *
 * - GET /queue — 3-layer queue model (current, overrides, automatic, pending)
 * - POST /queue/clear — remove override entries only
 * - POST /synthesize/abort — abort the current synthesis
 *
 * @module routes/queue
 */

import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { listMetas } from '../discovery/index.js';
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

  app.get('/queue', async () => {
    const currentPhase = queue.currentPhase;
    const overrides = queue.overrides;

    // Compute owedPhase for each override entry by reading meta state
    const enrichedOverrides = await Promise.all(
      overrides.map(async (o) => {
        try {
          const metaDir = resolveMetaDir(o.path);
          const meta = await readMetaJson(metaDir);
          const ps = derivePhaseState(meta);
          return {
            path: o.path,
            owedPhase: getOwedPhase(ps),
            enqueuedAt: o.enqueuedAt,
          };
        } catch {
          return {
            path: o.path,
            owedPhase: null as string | null,
            enqueuedAt: o.enqueuedAt,
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
      const metaResult = await listMetas(deps.config, deps.watcher);
      const candidates = buildPhaseCandidates(metaResult.entries);
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

    // Legacy: pending is the union of overrides + automatic + legacy queue items
    const pendingItems = [
      ...enrichedOverrides.map((o) => ({
        path: o.path,
        owedPhase: o.owedPhase,
      })),
      ...automatic.map((a) => ({
        path: a.path,
        owedPhase: a.owedPhase as string | null,
      })),
      ...queue.pending.map((item) => ({
        path: item.path,
        owedPhase: null as string | null,
      })),
    ];

    return {
      current: currentPhase
        ? {
            path: currentPhase.path,
            phase: currentPhase.phase,
            startedAt: currentPhase.startedAt,
          }
        : queue.current
          ? {
              path: queue.current.path,
              phase: null,
              startedAt: queue.current.enqueuedAt,
            }
          : null,
      overrides: enrichedOverrides,
      automatic,
      pending: pendingItems,
      // Legacy state
      state: queue.getState(),
    };
  });

  app.post('/queue/clear', () => {
    const removed = queue.clearOverrides();
    return { cleared: removed };
  });

  app.post('/synthesize/abort', async (_request, reply) => {
    // Check 3-layer current first
    const currentPhase = queue.currentPhase;
    const current = currentPhase ?? queue.current;

    if (!current) {
      return reply.status(200).send({ status: 'idle' });
    }

    // Abort the executor
    deps.executor?.abort();

    const metaDir = resolveMetaDir(current.path);
    const phase = currentPhase?.phase ?? null;

    // Transition running phase to failed and write _error to meta.json
    if (phase) {
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
    }

    // Release the lock for the current meta path
    try {
      releaseLock(metaDir);
    } catch {
      // Lock may already be released
    }

    deps.logger.info({ path: current.path }, 'Synthesis aborted');

    return {
      status: 'aborted',
      path: current.path,
      ...(phase ? { phase } : {}),
    };
  });
}
