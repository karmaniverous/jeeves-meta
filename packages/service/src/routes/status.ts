/**
 * GET /status — service health and status overview.
 *
 * Uses the core SDK's `createStatusHandler` factory with a custom
 * `getHealth` callback that preserves all existing health details.
 *
 * @module routes/status
 */

import { createStatusHandler } from '@karmaniverous/jeeves';
import type { FastifyInstance } from 'fastify';

import { SERVICE_NAME, SERVICE_VERSION } from '../constants.js';
import { listMetas } from '../discovery/index.js';
import {
  buildPhaseCandidates,
  derivePhaseState,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import type { PhaseName, PhaseStatus } from '../schema/meta.js';
import type { RouteDeps } from './index.js';

interface DepHealth {
  url: string;
  status: string;
  checkedAt: string | null;
}

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
  try {
    const res = await fetch(new URL('/status', url), {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { url, status: 'error', checkedAt };

    const data = (await res.json()) as {
      initialScan?: { active?: boolean };
    };
    const indexing = data.initialScan?.active === true;
    return {
      url,
      status: indexing ? 'indexing' : 'ok',
      checkedAt,
      indexing,
    };
  } catch {
    return { url, status: 'unreachable', checkedAt };
  }
}

/** Service-specific lifecycle state. */
export type ServiceState = 'idle' | 'synthesizing' | 'waiting' | 'stopping';

/** Derive service-specific state from current activity and lifecycle. */
function deriveServiceState(deps: RouteDeps): ServiceState {
  if (deps.shuttingDown) return 'stopping';
  if (deps.queue.current || deps.queue.currentPhase) return 'synthesizing';
  if (deps.queue.depth > 0 || deps.queue.overrides.length > 0) return 'waiting';
  return 'idle';
}

/** Phase state count record. */
type PhaseStateCounts = Record<PhaseStatus, number>;

function emptyPhaseCounts(): PhaseStateCounts {
  return { fresh: 0, stale: 0, pending: 0, running: 0, failed: 0 };
}

export function registerStatusRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  const statusHandler = createStatusHandler({
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    getHealth: async () => {
      const { config, queue, scheduler, stats, watcher } = deps;

      // On-demand dependency checks
      const [watcherHealth, gatewayHealth] = await Promise.all([
        checkWatcher(config.watcherUrl),
        checkDependency(config.gatewayUrl, '/status'),
      ]);

      // Phase state summary
      const phaseStateSummary: Record<PhaseName, PhaseStateCounts> = {
        architect: emptyPhaseCounts(),
        builder: emptyPhaseCounts(),
        critic: emptyPhaseCounts(),
      };

      let nextPhase: {
        path: string;
        phase: PhaseName;
        band: number;
        staleness: number;
      } | null = null;

      try {
        const metaResult = await listMetas(config, watcher);

        // Count raw phase states (before retry) for display
        for (const entry of metaResult.entries) {
          const ps = derivePhaseState(entry.meta);
          for (const phase of ['architect', 'builder', 'critic'] as const) {
            phaseStateSummary[phase][ps[phase]]++;
          }
        }

        // Build candidates (with auto-retry) for scheduling
        const candidates = buildPhaseCandidates(metaResult.entries);

        // Find next phase candidate
        const winner = selectPhaseCandidate(candidates, config.depthWeight);
        if (winner) {
          nextPhase = {
            path: winner.node.metaPath,
            phase: winner.owedPhase,
            band: winner.band,
            staleness: winner.effectiveStaleness,
          };
        }
      } catch {
        // Watcher unreachable — phase summary unavailable
      }

      return {
        serviceState: deriveServiceState(deps),
        currentTarget: queue.current?.path ?? queue.currentPhase?.path ?? null,
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
            rulesRegistered: deps.registrar?.isRegistered ?? false,
          },
          gateway: gatewayHealth,
        },
        phaseStateSummary,
        nextPhase,
      };
    },
  });

  app.get('/status', async (_request, reply) => {
    const result = await statusHandler();
    return reply.status(result.status).send(result.body);
  });
}
