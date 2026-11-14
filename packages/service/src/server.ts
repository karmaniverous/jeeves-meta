/**
 * Minimal Fastify HTTP server for jeeves-meta service.
 *
 * @module server
 */

import Fastify, { type FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';

import { MetaNotReady } from './api/errors.js';
import { registerRoutes, type RouteDeps } from './routes/index.js';

/** Routes served while the service is starting (matched route URLs). */
const UNGATED_ROUTES = new Set([
  '/status',
  '/config',
  '/config/apply',
  '/openapi.json',
]);

/** Options for creating the server. */
export interface ServerOptions {
  /** Pino logger instance. */
  logger: Logger;
  /** Shared route dependencies (mutable — late-bound properties like registrar are set after creation). */
  deps: RouteDeps;
}

/**
 * Create and configure the Fastify server.
 *
 * @param options - Server creation options.
 * @returns Configured Fastify instance (not yet listening).
 */
export function createServer(options: ServerOptions) {
  // Fastify 5 requires `loggerInstance` for external pino loggers
  const app = Fastify({
    loggerInstance: options.logger as unknown as FastifyBaseLogger,
    requestTimeout: 30_000,
  });

  // Readiness gate (Decision 199): 503 META_NOT_READY while starting,
  // except routes matched as config, configApply and the OpenAPI document.
  // onRequest runs before catalog validation, so any request shape gets it.
  app.addHook('onRequest', (request, _reply, done) => {
    if (
      options.deps.ready ||
      UNGATED_ROUTES.has(request.routeOptions.url ?? '')
    ) {
      done();
      return;
    }
    done(new MetaNotReady());
  });

  registerRoutes(app, options.deps);

  return app;
}
