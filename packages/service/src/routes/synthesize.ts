/**
 * POST /synthesize route handler.
 *
 * Path-targeted triggers create explicit override entries in the queue.
 * Corpus-wide triggers discover the stalest candidate.
 *
 * @module routes/synthesize
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { listMetas } from '../discovery/index.js';
import { resolveMetaDir } from '../lock.js';
import { derivePhaseState, getOwedPhase } from '../phaseState/index.js';
import { readMetaJson } from '../readMetaJson.js';
import { discoverStalestPath } from '../scheduling/index.js';
import type { RouteDeps } from './index.js';

const synthesizeBodySchema = z.object({
  path: z.string().optional(),
});

/** Register the POST /synthesize route. */
export function registerSynthesizeRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.post('/synthesize', async (request, reply) => {
    const body = synthesizeBodySchema.parse(request.body);
    const { config, watcher, queue } = deps;

    if (body.path) {
      // Path-targeted trigger: create override entry
      const targetPath = resolveMetaDir(body.path);

      // Read meta to determine owed phase
      let owedPhase: string | null = null;
      let meta;
      try {
        meta = await readMetaJson(targetPath);
        const phaseState = derivePhaseState(meta);
        owedPhase = getOwedPhase(phaseState);
      } catch {
        // Meta unreadable — proceed, phase will be evaluated at dequeue time
      }

      // Fully fresh meta → skip (reuse meta already read above)
      if (owedPhase === null && meta && (meta._phaseState || meta._content)) {
        return await reply.code(200).send({
          status: 'skipped',
          path: targetPath,
          owedPhase: null,
          queuePosition: -1,
          alreadyQueued: false,
        });
      }

      const result = queue.enqueueOverride(targetPath);
      return reply.code(202).send({
        status: 'queued',
        path: targetPath,
        owedPhase,
        queuePosition: result.position,
        alreadyQueued: result.alreadyQueued,
      });
    }

    // Corpus-wide trigger: discover stalest candidate
    let result;
    try {
      result = await listMetas(config, watcher);
    } catch {
      return reply.status(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Watcher unreachable — cannot discover candidates',
      });
    }
    const stale = result.entries
      .filter((e) => e.stalenessSeconds > 0 && !e.disabled)
      .map((e) => ({
        node: e.node,
        meta: e.meta,
        actualStaleness: e.stalenessSeconds,
      }));
    const stalest = discoverStalestPath(stale, config.depthWeight);
    if (!stalest) {
      return reply.code(200).send({
        status: 'skipped',
        message: 'No stale metas found. Nothing to synthesize.',
      });
    }

    const enqueueResult = queue.enqueue(stalest);

    return reply.code(202).send({
      status: 'accepted',
      path: stalest,
      queuePosition: enqueueResult.position,
      alreadyQueued: enqueueResult.alreadyQueued,
    });
  });
}
