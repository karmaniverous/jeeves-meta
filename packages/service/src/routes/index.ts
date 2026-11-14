/**
 * jeeves-meta's HTTP API: every route of `META_CATALOG`, registered by
 * jeeves `registerCatalogRoutes` with request and strict response
 * validation (spec 4.4.6), plus `GET /openapi.json`.
 *
 * @remarks
 * Errors: jeeves' catalog scope answers every error on catalog routes, and
 * `registerErrorHandlers` gives the other routes (`/openapi.json`, unknown
 * routes, the readiness gate) the same rule: a `defineError` error
 * (`api/errors.ts`) or a Fastify 4xx is sent as Fastify's standard body;
 * anything else is a logged, masked 500.
 *
 * @module routes
 */

import type { ConfigApplyHandler } from '@karmaniverous/jeeves';
import {
  registerCatalogRoutes,
  registerErrorHandlers,
  registerOpenApiRoute,
} from '@karmaniverous/jeeves/fastify';
import {
  META_CATALOG,
  META_OPENAPI_DOCUMENT,
} from '@karmaniverous/jeeves-meta-core';
import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { MetaHandlers } from '../api/handlerTypes.js';
import type { MetaCache } from '../cache.js';
import type { GatewayExecutor } from '../executor/index.js';
import type { WatcherClient } from '../interfaces/index.js';
import type { SynthesisQueue } from '../queue/index.js';
import type { RuleRegistrar } from '../rules/index.js';
import type { Scheduler } from '../scheduler/index.js';
import type { ServiceConfig } from '../schema/config.js';
import { createConfigHandlers } from './config.js';
import { createConfigApplyHandlers } from './configApply.js';
import { createMetasHandlers } from './metas.js';
import { createMetasUpdateHandlers } from './metasUpdate.js';
import { createPreviewHandlers } from './preview.js';
import { createQueueHandlers } from './queue.js';
import { createSeedHandlers } from './seed.js';
import { createStatusHandlers } from './status.js';
import { createSynthesizeHandlers } from './synthesize.js';
import { createUnlockHandlers } from './unlock.js';

/** Runtime stats tracked by the service. */
export interface ServiceStats {
  totalSyntheses: number;
  totalTokens: number;
  totalErrors: number;
  lastCycleDurationMs: number | null;
  lastCycleAt: string | null;
}

/**
 * Large generated fields excluded from detail/update response projections.
 * Shared between metas detail and metasUpdate routes.
 */
export const DEFAULT_EXCLUDE_FIELDS = new Set([
  '_architect',
  '_builder',
  '_critic',
  '_content',
  '_feedback',
]);

/** Dependencies injected into route handlers. */
export interface RouteDeps {
  config: ServiceConfig;
  logger: Logger;
  queue: SynthesisQueue;
  watcher: WatcherClient;
  scheduler: Scheduler | null;
  stats: ServiceStats;
  /** Cached listMetas results with TTL. */
  cache: MetaCache;
  /** Service readiness flag — false during startup. */
  ready: boolean;
  /** Rule registrar for reporting registration state in /status. */
  registrar?: RuleRegistrar;
  /** Executor instance for abort support. */
  executor?: Pick<GatewayExecutor, 'abort'>;
  /** Set to true during graceful shutdown. */
  shuttingDown?: boolean;
  /** Runtime config file path for config-apply. */
  configPath?: string;
  /** Core config apply handler bound to {@link RouteDeps.configPath}. */
  configApply?: ConfigApplyHandler;
}

/**
 * One handler per catalog entry.
 *
 * @param deps - Route dependencies.
 * @returns The handlers.
 */
export function createMetaHandlers(deps: RouteDeps): MetaHandlers {
  return {
    ...createStatusHandlers(deps),
    ...createMetasHandlers(deps),
    ...createMetasUpdateHandlers(deps),
    ...createSynthesizeHandlers(deps),
    ...createQueueHandlers(deps),
    ...createPreviewHandlers(deps),
    ...createSeedHandlers(deps),
    ...createUnlockHandlers(deps),
    ...createConfigHandlers(deps),
    ...createConfigApplyHandlers(deps),
  };
}

/**
 * Register all HTTP routes on the Fastify instance. The catalog routes go
 * in a child plugin, so a registration error surfaces from `ready()`.
 *
 * @param app - Fastify instance.
 * @param deps - Route dependencies.
 */
export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const handlers = createMetaHandlers(deps);
  registerErrorHandlers(app);
  void app.register(async (child) => {
    await registerCatalogRoutes(child, META_CATALOG, handlers, {
      responseValidation: 'strict',
    });
  });
  registerOpenApiRoute(app, META_OPENAPI_DOCUMENT);
}
