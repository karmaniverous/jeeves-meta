/**
 * Queue management and abort routes.
 *
 * - GET /queue — current queue state
 * - POST /queue/clear — remove all pending items
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

  app.get('/queue', () => ({
    current: queue.current,
    pending: queue.pending,
    state: queue.getState(),
  }));

  app.post('/queue/clear', () => {
    const removed = queue.clear();
    return { cleared: removed };
  });

  app.post('/synthesize/abort', async (_request, reply) => {
    const current = queue.current;
    if (!current) {
      return reply
        .status(404)
        .send({ error: 'NOT_FOUND', message: 'No synthesis in progress' });
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

    return { status: 'aborted', path: current.path };
  });
}
