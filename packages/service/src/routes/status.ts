/**
 * GET /status — service health and status overview.
 *
 * Uses the core SDK's `createStatusHandler` factory with a custom
 * `getHealth` callback that preserves all existing health details.
 *
 * @module routes/status
 */

import { createStatusHandler } from '@karmaniverous/jeeves';
import {
  type DepHealth,
  type MetaResponse,
  type NextPhaseCandidate,
  type PhaseStateSummary,
  type PhaseStatus,
  type ServiceState,
} from '@karmaniverous/jeeves-meta-core';

import type { MetaHandlers } from '../api/handlerTypes.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../constants.js';
import { computeSummary } from '../discovery/computeSummary.js';
import { finiteOrNull } from '../finiteOrNull.js';
import {
  buildPhaseCandidates,
  derivePhaseState,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import { probeWatcher } from '../watcher-client/index.js';
import type { RouteDeps } from './index.js';

interface WatcherHealth extends DepHealth {
  indexing?: boolean;
}

async function checkDependency(url: string, path: string): Promise<DepHealth> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(new URL(path, url), {
      signal: AbortSignal.timeout(3000),
    });
    return { url, status: res.ok ? 'ok' : 'error', checkedAt };
  } catch {
    return { url, status: 'unreachable', checkedAt };
  }
}

async function checkWatcher(url: string): Promise<WatcherHealth> {
  const checkedAt = new Date().toISOString();
  const probe = await probeWatcher(url, 3000);
  if (probe.status === 'unreachable' || probe.status === 'error')
    return { url, status: probe.status, checkedAt };
  return { url, status: probe.status, checkedAt, indexing: probe.indexing };
}

/** Derive service-specific state from current activity and lifecycle. */
function deriveServiceState(deps: RouteDeps): ServiceState {
  if (deps.shuttingDown) return 'stopping';
  if (!deps.ready) return 'starting';
  if (deps.queue.currentPhase) return 'synthesizing';
  if (deps.queue.depth > 0) return 'waiting';
  return 'idle';
}

function emptyPhaseCounts(): Record<PhaseStatus, number> {
  return { fresh: 0, stale: 0, pending: 0, running: 0, failed: 0 };
}

/**
 * The `status` handler: jeeves `createStatusHandler` with meta's health.
 *
 * @param deps - Route dependencies.
 * @returns The handler.
 */
export function createStatusHandlers(
  deps: RouteDeps,
): Pick<MetaHandlers, 'status'> {
  const statusHandler = createStatusHandler({
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    getHealth: async () => {
      const { config, queue, scheduler, stats, watcher, cache } = deps;

      // On-demand dependency checks
      const [watcherHealth, gatewayHealth] = await Promise.all([
        checkWatcher(config.watcherUrl),
        checkDependency(config.gatewayUrl, '/status'),
      ]);

      // Phase state summary
      const phaseStateSummary: PhaseStateSummary = {
        architect: emptyPhaseCounts(),
        builder: emptyPhaseCounts(),
        critic: emptyPhaseCounts(),
      };

      let nextPhase: NextPhaseCandidate | null = null;
      let metaCounts: {
        total: number;
        enabled: number;
        disabled: number;
        neverSynthesized: number;
        stale: number;
        errors: number;
        locked: number;
      } | null = null;

      // While starting, the first meta list is still loading: report the
      // state, dependencies and stats without it (Decision 199).
      if (deps.ready) {
        try {
          // Never wait on a refresh of the whole corpus: a health check answers
          // from the last list, refreshed in the background.
          const metaResult = await cache.peek(config, watcher);

          // Count raw phase states (before retry) for display
          for (const entry of metaResult.entries) {
            const ps = derivePhaseState(entry.meta);
            for (const phase of ['architect', 'builder', 'critic'] as const) {
              phaseStateSummary[phase][ps[phase]]++;
            }
          }

          // Build candidates (with auto-retry) for scheduling
          const candidates = buildPhaseCandidates(
            metaResult.entries,
            config.architectEvery,
          );

          // Find next phase candidate
          const winner = selectPhaseCandidate(candidates, config.depthWeight);
          if (winner) {
            nextPhase = {
              path: winner.node.metaPath,
              phase: winner.owedPhase,
              band: winner.band,
              staleness: finiteOrNull(winner.effectiveStaleness),
            };
          }

          // Meta counts summary
          const summary = computeSummary(
            metaResult.entries,
            config.depthWeight,
          );
          metaCounts = {
            total: summary.total,
            enabled: summary.total - summary.disabled,
            disabled: summary.disabled,
            neverSynthesized: summary.neverSynthesized,
            stale: summary.stale,
            errors: summary.errors,
            locked: summary.locked,
          };
        } catch {
          // Watcher unreachable — phase summary unavailable
        }
      }

      return {
        serviceState: deriveServiceState(deps),
        currentTarget: queue.currentPhase?.path ?? null,
        queue: queue.getState(),
        stats: {
          totalSyntheses: stats.totalSyntheses,
          totalTokens: stats.totalTokens,
          totalErrors: stats.totalErrors,
          lastCycleDurationMs: stats.lastCycleDurationMs,
          lastCycleAt: stats.lastCycleAt,
        },
        schedule: {
          expression: config.schedule,
          nextAt: scheduler?.nextRunAt?.toISOString() ?? null,
        },
        dependencies: {
          watcher: {
            ...watcherHealth,
            rulesRegistered: true,
          },
          gateway: gatewayHealth,
        },
        phaseStateSummary,
        nextPhase,
        metaCounts,
      };
    },
  });

  return {
    status: async () => {
      const result = await statusHandler();
      return {
        status: 200,
        body: result.body as MetaResponse<'status'>,
      };
    },
  };
}
