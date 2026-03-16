/**
 * GET /status — service health and status overview.
 *
 * On-demand dependency health checks (lightweight ping).
 *
 * @module routes/status
 */

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
  app.get('/status', async () => {
    const { config, queue, scheduler, stats } = deps;

    // On-demand dependency checks
    const [watcherHealth, gatewayHealth] = await Promise.all([
      checkWatcher(config.watcherUrl),
      checkDependency(config.gatewayUrl, '/api/status'),
    ]);

    const degraded =
      (watcherHealth.status !== 'ok' && watcherHealth.status !== 'indexing') ||
      gatewayHealth.status !== 'ok';
    const indexing = watcherHealth.status === 'indexing';

    // Determine status
    let status: string;
    if (deps.shuttingDown) {
      status = 'stopping';
    } else if (queue.current) {
      status = 'synthesizing';
    } else if (degraded) {
      status = 'degraded';
    } else if (indexing) {
      status = 'waiting';
    } else {
      status = 'idle';
    }

    // Metas summary is expensive (watcher walk + disk reads).
    // Use GET /metas for full inventory; status is a lightweight health check.

    return {
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: process.uptime(),
      status,
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
  });
}
