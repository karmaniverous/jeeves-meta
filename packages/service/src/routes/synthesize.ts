/**
 * POST /synthesize route handler.
 *
 * Path-targeted triggers create explicit override entries in the queue.
 * Corpus-wide triggers discover the stalest candidate.
 *
 * @module routes/synthesize
 */

import type { PhaseName } from '@karmaniverous/jeeves-meta-core';

import { MetaWatcherUnavailable } from '../api/errors.js';
import type { MetaHandlers } from '../api/handlerTypes.js';
import { buildMinimalNode } from '../discovery/buildMinimalNode.js';
import { getScopeFiles } from '../discovery/index.js';
import { resolveMetaDir } from '../lock.js';
import { normalizePath } from '../normalizePath.js';
import { persistPhaseState } from '../orchestrator/runPhase.js';
import {
  buildPhaseCandidates,
  computeInvalidation,
  getOwedPhase,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import { readMetaJson } from '../readMetaJson.js';
import type { RouteDeps } from './index.js';

/**
 * The `synthesize` handler.
 *
 * @param deps - Route dependencies.
 * @returns The handler.
 */
export function createSynthesizeHandlers(
  deps: RouteDeps,
): Pick<MetaHandlers, 'synthesize'> {
  return {
    synthesize: async ({ body }) => {
      const { config, watcher, queue, cache } = deps;

      if (body.path) {
        // Path-targeted trigger: create override entry
        const targetPath = resolveMetaDir(body.path);

        // Read meta and recompute invalidation against current inputs
        // (structure hash, steer, cross-refs, prompt snapshots) rather than
        // trusting the cached _phaseState. Fixes #160.
        let owedPhase: PhaseName | null = null;
        let meta;
        try {
          meta = await readMetaJson(targetPath);
          const node = await buildMinimalNode(
            normalizePath(targetPath),
            watcher,
          );
          const { scopeFiles } = await getScopeFiles(node, watcher);
          const invalidation = await computeInvalidation(
            meta,
            scopeFiles,
            config,
            node,
          );

          owedPhase = getOwedPhase(invalidation.phaseState);

          // Persist recomputed phase state + structure hash when stale.
          // Matches the scheduler's Tier 2 pattern: always persist so the
          // stored _phaseState reflects reality for subsequent reads.
          if (owedPhase) {
            await persistPhaseState(
              {
                metaPath: targetPath,
                current: meta,
                config,
                structureHash: invalidation.inputStatus.structureHash,
              },
              invalidation.phaseState,
              {},
            );
            cache.invalidate();
          }
        } catch {
          // Meta unreadable or watcher unavailable — proceed,
          // phase will be evaluated at dequeue time
        }

        // Fully fresh meta → skip
        if (owedPhase === null && meta && (meta._phaseState || meta._content)) {
          return {
            status: 200,
            body: {
              status: 'skipped',
              path: targetPath,
              owedPhase: null,
              queuePosition: -1,
              alreadyQueued: false,
            },
          } as const;
        }

        const result = queue.enqueue(targetPath);
        return {
          status: 202,
          body: {
            status: 'queued',
            path: targetPath,
            owedPhase,
            queuePosition: result.position,
            alreadyQueued: result.alreadyQueued,
          },
        } as const;
      }

      // Corpus-wide trigger: discover stalest candidate
      let result;
      try {
        result = await cache.get(config, watcher);
      } catch {
        throw new MetaWatcherUnavailable('discover candidates');
      }
      const candidates = buildPhaseCandidates(
        result.entries,
        config.architectEvery,
      );
      const winner = selectPhaseCandidate(candidates, config.depthWeight);
      if (!winner) {
        return {
          status: 200,
          body: {
            status: 'skipped',
            message: 'No stale metas found. Nothing to synthesize.',
          },
        } as const;
      }

      const stalest = winner.node.metaPath;
      const enqueueResult = queue.enqueue(stalest);

      return {
        status: 202,
        body: {
          status: 'queued',
          path: stalest,
          owedPhase: winner.owedPhase,
          queuePosition: enqueueResult.position,
          alreadyQueued: enqueueResult.alreadyQueued,
        },
      } as const;
    },
  };
}
