/**
 * POST /config/apply — apply a config patch to the runtime config file.
 *
 * Delegates the read/merge/validate/write cycle to the core SDK's
 * `createConfigApplyHandler` (bound to the runtime config path), which
 * merges into the raw file, validates without writing the schema's parsed
 * output, and keeps the file mode (0600 for a new file). The catalog
 * validates the request; this handler adds `restartRequired` reporting and
 * keeps the resolved config (which may hold secrets) out of the response.
 *
 * @module routes/configApply
 */

import { readFileSync } from 'node:fs';

import type { HandlerErrorBody } from '@karmaniverous/jeeves/fastify';

import { MetaConfigUnavailable } from '../api/errors.js';
import type { MetaHandlers } from '../api/handlerTypes.js';
import { RESTART_REQUIRED_FIELDS } from '../configHotReload.js';
import { serviceConfigSchema } from '../schema/config.js';
import type { RouteDeps } from './index.js';

/** Core handler success/warning body shape. */
interface AppliedBody {
  applied?: boolean;
  warning?: string;
  config?: Record<string, unknown>;
}

/**
 * Snapshot the effective (schema-resolved) config currently on disk.
 *
 * @param configPath - Runtime config file path.
 * @returns The resolved config, the raw object when it does not validate,
 *   or `{}` when the file is missing or unreadable.
 */
function readEffectiveConfig(configPath: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
  const parsed = serviceConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * The `configApply` handler.
 *
 * @param deps - Route dependencies (`configApply` and `configPath`).
 * @returns The handler.
 */
export function createConfigApplyHandlers(
  deps: Pick<RouteDeps, 'configApply' | 'configPath'>,
): Pick<MetaHandlers, 'configApply'> {
  return {
    configApply: async ({ body: { patch, replace } }) => {
      const { configApply: applyConfig, configPath } = deps;
      if (!applyConfig || !configPath) throw new MetaConfigUnavailable();

      const previous = readEffectiveConfig(configPath);
      const result = await applyConfig({ patch, replace });
      // jeeves' own failures (invalid merged config 400, write error 500)
      // pass through with its standard body.
      if (result.status !== 200)
        return {
          status: result.status as 400 | 500,
          body: result.body as HandlerErrorBody,
        };

      // Never echo the resolved config: it may hold secrets (gatewayApiKey).
      const { config: next = {}, warning } = result.body as AppliedBody;
      const restartRequired = RESTART_REQUIRED_FIELDS.some(
        (field) =>
          JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
      );

      return {
        status: 200,
        body: {
          applied: true,
          ...(warning ? { warning } : {}),
          restartRequired,
        },
      };
    },
  };
}
