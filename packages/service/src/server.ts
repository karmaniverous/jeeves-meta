/**
 * Minimal Fastify HTTP server for jeeves-meta service.
 *
 * @module server
 */

import Fastify, { type FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';

import { registerRoutes, type RouteDeps } from './routes/index.js';

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

  // Readiness gate: return 503 while service is initializing
  app.addHook('onRequest', async (request, reply) => {
    if (options.deps.ready) return;
    const url = request.url;
    if (url === '/config' || url.startsWith('/config/apply')) return;
    return reply
      .status(503)
      .send({ status: 'starting', message: 'Service initializing' });
  });

  registerRoutes(app, options.deps);

  return app;
}
