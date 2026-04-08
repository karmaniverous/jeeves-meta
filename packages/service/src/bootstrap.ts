/**
 * Service bootstrap — wire up all components and start listening.
 *
 * @module bootstrap
 */

import { watchFile } from 'node:fs';

import { getBindAddress } from '@karmaniverous/jeeves';

import {
  applyHotReloadedConfig,
  registerConfigHotReloadRuntime,
} from './configHotReload.js';
import { loadServiceConfig } from './configLoader.js';
import { listMetas } from './discovery/index.js';
import { GatewayExecutor } from './executor/index.js';
import { cleanupStaleLocks } from './lock.js';
import { createLogger } from './logger/index.js';
import { orchestrate } from './orchestrator/index.js';
import { type ProgressPhase, ProgressReporter } from './progress/index.js';
import { SynthesisQueue } from './queue/index.js';
import type { RouteDeps, ServiceStats } from './routes/index.js';
import { WatcherHealthCheck } from './rules/healthCheck.js';
import { RuleRegistrar } from './rules/index.js';
import { verifyRuleApplication } from './rules/verify.js';
import { Scheduler } from './scheduler/index.js';
import { type ServiceConfig } from './schema/config.js';
import { createServer } from './server.js';
import { registerShutdownHandlers } from './shutdown/index.js';
import { HttpWatcherClient } from './watcher-client/index.js';

/**
 * Bootstrap the service: create logger, build server, start listening,
 * wire scheduler, queue processing, rule registration, config hot-reload,
 * startup lock cleanup, and shutdown.
 *
 * @param config - Validated service configuration.
 * @param configPath - Optional path to config file for hot-reload.
 */
export async function startService(
  config: ServiceConfig,
  configPath?: string,
): Promise<void> {
  const logger = createLogger({
    level: config.logging.level,
    file: config.logging.file,
  });

  // Wire synthesis executor + watcher
  const watcher = new HttpWatcherClient({ baseUrl: config.watcherUrl });
  const executor = new GatewayExecutor({
    gatewayUrl: config.gatewayUrl,
    apiKey: config.gatewayApiKey,
  });

  // Runtime stats (mutable, shared with routes)
  const stats: ServiceStats = {
    totalSyntheses: 0,
    totalTokens: 0,
    totalErrors: 0,
    lastCycleDurationMs: null,
    lastCycleAt: null,
  };

  const queue = new SynthesisQueue(logger);

  // Scheduler (needs watcher for discovery)
  const scheduler = new Scheduler(config, queue, logger, watcher);

  const routeDeps: RouteDeps = {
    config,
    logger,
    queue,
    watcher,
    scheduler,
    stats,
    executor,
    configPath,
  };

  registerConfigHotReloadRuntime({
    config,
    logger,
    scheduler,
  });

  const server = createServer({
    logger,
    deps: routeDeps,
  });

  // Start HTTP server
  const bindAddress = getBindAddress('meta');
  try {
    await server.listen({ port: config.port, host: bindAddress });
    logger.info({ port: config.port, host: bindAddress }, 'Service listening');
  } catch (err) {
    logger.error(err, 'Failed to start service');
    process.exit(1);
  }

  // Progress reporter — uses shared config reference so hot-reload propagates
  const progress = new ProgressReporter(config, logger);

  // Wire queue processing — synthesize one meta per dequeue
  const synthesizeFn = async (path: string): Promise<void> => {
    const startMs = Date.now();
    let cycleTokens = 0;
    // Strip .meta suffix for human-readable progress reporting
    const ownerPath = path.replace(/\/?\.meta\/?$/, '');
    await progress.report({
      type: 'synthesis_start',
      path: ownerPath,
    });

    try {
      const results = await orchestrate(
        config,
        executor,
        watcher,
        path,
        async (evt) => {
          // Track token stats from phase completions
          if (evt.type === 'phase_complete') {
            if (evt.tokens !== undefined) {
              stats.totalTokens += evt.tokens;
              cycleTokens += evt.tokens;
            } else {
              logger.warn(
                { path: ownerPath, phase: evt.phase },
                'Token count unavailable (session lookup may have timed out)',
              );
            }
          }
          await progress.report(evt);
        },
        logger,
      );
      // orchestrate() always returns exactly one result
      const result = results[0];
      const durationMs = Date.now() - startMs;

      if (!result.synthesized) {
        // Entity was skipped (e.g. empty scope) — no progress to report.
        logger.debug({ path: ownerPath }, 'Synthesis skipped');
        return;
      }

      // Update stats
      stats.totalSyntheses++;
      stats.lastCycleDurationMs = durationMs;
      stats.lastCycleAt = new Date().toISOString();

      if (result.error) {
        stats.totalErrors++;
        await progress.report({
          type: 'error',
          path: ownerPath,
          phase: result.error.step as ProgressPhase,
          error: result.error.message,
        });
      } else {
        scheduler.resetBackoff();
        await progress.report({
          type: 'synthesis_complete',
          path: ownerPath,
          tokens: cycleTokens,
          durationMs,
        });
      }
    } catch (err) {
      stats.totalErrors++;
      const message = err instanceof Error ? err.message : String(err);
      await progress.report({
        type: 'error',
        path: ownerPath,
        error: message,
      });
      throw err;
    }
  };

  // Auto-process queue when new items arrive
  queue.onEnqueue(() => {
    void queue.processQueue(synthesizeFn);
  });

  // Startup: clean stale locks (gap #16)
  try {
    const metaResult = await listMetas(config, watcher);
    const metaPaths = metaResult.entries.map((e) => e.node.metaPath);
    cleanupStaleLocks(metaPaths, logger);
  } catch (err) {
    logger.warn({ err }, 'Could not clean stale locks (watcher may be down)');
  }

  // Start scheduler
  scheduler.start();

  // Rule registration (fire-and-forget with retries) + post-registration verification
  const registrar = new RuleRegistrar(config, logger, watcher);
  scheduler.setRegistrar(registrar);
  routeDeps.registrar = registrar;
  void registrar.register().then(() => {
    if (registrar.isRegistered) {
      void verifyRuleApplication(watcher, logger);
    }
  });

  // Periodic watcher health check (independent of scheduler)
  const healthCheck = new WatcherHealthCheck({
    watcherUrl: config.watcherUrl,
    intervalMs: config.watcherHealthIntervalMs,
    registrar,
    logger,
  });
  healthCheck.start();

  // Config hot-reload (gap #12, expanded #32)
  if (configPath) {
    watchFile(configPath, { interval: 5000 }, () => {
      try {
        applyHotReloadedConfig(loadServiceConfig(configPath));
      } catch (err) {
        logger.warn({ err }, 'Config hot-reload failed');
      }
    });
  }

  // Shutdown handlers
  registerShutdownHandlers({
    server,
    scheduler,
    queue,
    logger,
    routeDeps,
    onShutdown: () => {
      healthCheck.stop();
    },
  });

  logger.info('Service fully initialized');
}
