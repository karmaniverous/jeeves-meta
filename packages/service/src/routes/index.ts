/**
 * Route registration for jeeves-meta service.
 *
 * @module routes
 */

import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { GatewayExecutor } from '../executor/index.js';
import type { WatcherClient } from '../interfaces/index.js';
import type { SynthesisQueue } from '../queue/index.js';
import type { RuleRegistrar } from '../rules/index.js';
import type { Scheduler } from '../scheduler/index.js';
import type { ServiceConfig } from '../schema/config.js';
import { registerConfigRoute } from './config.js';
import { registerConfigApplyRoute } from './configApply.js';
import { registerMetasRoutes } from './metas.js';
import { registerMetasUpdateRoute } from './metasUpdate.js';
import { registerPreviewRoute } from './preview.js';
import { registerQueueRoutes } from './queue.js';
import { registerSeedRoute } from './seed.js';
import { registerStatusRoute } from './status.js';
import { registerSynthesizeRoute } from './synthesize.js';
import { registerUnlockRoute } from './unlock.js';

/** Runtime stats tracked by the service. */
export interface ServiceStats {
  totalSyntheses: number;
  totalTokens: number;
  totalErrors: number;
  lastCycleDurationMs: number | null;
  lastCycleAt: string | null;
}

/** Dependencies injected into route handlers. */
export interface RouteDeps {
  config: ServiceConfig;
  logger: Logger;
  queue: SynthesisQueue;
  watcher: WatcherClient;
  scheduler: Scheduler | null;
  stats: ServiceStats;
  /** Rule registrar for reporting registration state in /status. */
  registrar?: RuleRegistrar;
  /** Executor instance for abort support. */
  executor?: Pick<GatewayExecutor, 'abort'>;
  /** Set to true during graceful shutdown. */
  shuttingDown?: boolean;
  /** Runtime config file path for config-apply. */
  configPath?: string;
}

/** Register all HTTP routes on the Fastify instance. */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  // Global error handler for validation + watcher errors
  app.setErrorHandler(
    (
      error: Error & { validation?: unknown; statusCode?: number },
      _request,
      reply,
    ) => {
      if (error.validation) {
        return reply
          .status(400)
          .send({ error: 'BAD_REQUEST', message: error.message });
      }
      if (error.statusCode === 404) {
        return reply
          .status(404)
          .send({ error: 'NOT_FOUND', message: error.message });
      }
      deps.logger.error(error, 'Unhandled route error');
      return reply
        .status(500)
        .send({ error: 'INTERNAL_ERROR', message: error.message });
    },
  );

  registerStatusRoute(app, deps);
  registerMetasRoutes(app, deps);
  registerMetasUpdateRoute(app, deps);
  registerSynthesizeRoute(app, deps);
  registerPreviewRoute(app, deps);
  registerSeedRoute(app, deps);
  registerUnlockRoute(app, deps);
  registerConfigRoute(app, deps);
  registerConfigApplyRoute(app, deps.configPath);
  registerQueueRoutes(app, deps);
}
