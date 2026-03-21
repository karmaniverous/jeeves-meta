/**
 * GET /config — query service configuration with optional JSONPath.
 *
 * Replaces the old GET /config/validate endpoint with the core SDK's
 * `createConfigQueryHandler()` for JSONPath support.
 *
 * @module routes/config
 */

import { createConfigQueryHandler } from '@karmaniverous/jeeves';
import type { FastifyInstance } from 'fastify';

import type { ServiceConfig } from '../schema/config.js';
import type { RouteDeps } from './index.js';

/** Return a sanitized copy of the config (redact gatewayApiKey). */
function sanitizeConfig(config: ServiceConfig): unknown {
  return {
    ...config,
    gatewayApiKey: config.gatewayApiKey ? '[REDACTED]' : undefined,
  };
}

export function registerConfigRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  const configHandler = createConfigQueryHandler(() =>
    sanitizeConfig(deps.config),
  );

  app.get('/config', async (request, reply) => {
    const { path } = request.query as { path?: string };
    const result = await configHandler({ path });
    return reply.status(result.status).send(result.body);
  });
}
