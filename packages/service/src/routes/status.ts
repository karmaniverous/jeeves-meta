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

/** Check watcher, surfacing initialScan.active as indexing state. */
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

export function registerStatusRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  const statusHandler = createStatusHandler({
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
    getHealth: async () => {
      const { config, queue, scheduler, stats } = deps;

      // On-demand dependency checks
      const [watcherHealth, gatewayHealth] = await Promise.all([
        checkWatcher(config.watcherUrl),
        checkDependency(config.gatewayUrl, '/status'),
      ]);

      return {
        currentTarget: queue.current?.path ?? null,
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
      };
    },
  });

  app.get('/status', async (_request, reply) => {
    const result = await statusHandler();
    return reply.status(result.status).send(result.body);
  });
}
