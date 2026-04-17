/**
 * Queue management and abort routes.
 *
 * - GET /queue — 3-layer queue model (current, overrides, automatic, pending)
 * - POST /queue/clear — remove override entries only
 * - POST /synthesize/abort — abort the current synthesis
 *
 * @module routes/queue
 */

import type { FastifyInstance } from 'fastify';

import { releaseLock, resolveMetaDir } from '../lock.js';
import type { RouteDeps } from './index.js';

/** Register queue management routes. */
export function registerQueueRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  const { queue } = deps;

  app.get('/queue', () => {
    const currentPhase = queue.currentPhase;
    const overrides = queue.overrides;

    // Legacy: pending is the union of overrides + legacy queue items
    const pendingItems = [
      ...overrides.map((o) => ({
        path: o.path,
        owedPhase: null as string | null,
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
      overrides: overrides.map((o) => ({
        path: o.path,
        owedPhase: null,
        enqueuedAt: o.enqueuedAt,
      })),
      automatic: [],
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

    // Release the lock for the current meta path
    try {
      releaseLock(resolveMetaDir(current.path));
    } catch {
      // Lock may already be released
    }

    deps.logger.info({ path: current.path }, 'Synthesis aborted');

    const phase = currentPhase?.phase ?? null;
    return {
      status: 'aborted',
      path: current.path,
      ...(phase ? { phase } : {}),
    };
  });
}
