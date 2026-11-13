/**
 * `config` handler: the service configuration with secrets redacted, or a
 * JSONPath result (jeeves `createConfigQueryHandler`). A JSONPath that
 * cannot be evaluated is meta's `META_INVALID_JSONPATH` (Decision 212).
 * Pure apart from reading the in-memory config.
 *
 * @module routes/config
 */

import { createConfigQueryHandler } from '@karmaniverous/jeeves';

import { capArg, MetaInvalidJsonPath } from '../api/errors.js';
import type { MetaHandlers } from '../api/handlerTypes.js';
import type { ServiceConfig } from '../schema/config.js';
import type { RouteDeps } from './index.js';

/** A sanitized copy of the config (gatewayApiKey and serverKey redacted). */
function sanitizeConfig(config: ServiceConfig): unknown {
  return {
    ...config,
    gatewayApiKey: config.gatewayApiKey ? '[REDACTED]' : undefined,
    serverKey: config.serverKey ? '[REDACTED]' : undefined,
  };
}

/**
 * The `config` handler.
 *
 * @param deps - Route dependencies.
 * @returns The handler.
 */
export function createConfigHandlers(
  deps: RouteDeps,
): Pick<MetaHandlers, 'config'> {
  const query = createConfigQueryHandler(() => sanitizeConfig(deps.config));
  return {
    config: async ({ query: { path } }) => {
      const result = await query({ path });
      if (result.status === 400) {
        const { message } = result.body as { message: string };
        throw new MetaInvalidJsonPath(capArg(message));
      }
      return { status: 200, body: result.body as Record<string, unknown> };
    },
  };
}
