/**
 * POST /config/apply — apply a config patch to the runtime config file.
 *
 * Delegates the read/merge/validate/write cycle to the core SDK's
 * `createConfigApplyHandler` (bound to the runtime config path), which
 * merges into the raw file, validates without writing the schema's parsed
 * output, and keeps the file mode (0600 for a new file). This route adds
 * request validation, `restartRequired` reporting, and keeps the resolved
 * config (which may hold secrets) out of the response.
 *
 * @module routes/configApply
 */

import { readFileSync } from 'node:fs';

import type { ConfigApplyHandler } from '@karmaniverous/jeeves';
import { getEndpoint } from '@karmaniverous/jeeves-meta-core';
import type { FastifyInstance } from 'fastify';

import { RESTART_REQUIRED_FIELDS } from '../configHotReload.js';
import { serviceConfigSchema } from '../schema/config.js';

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
 * Register the POST /config/apply route.
 *
 * @param app - Fastify instance.
 * @param applyConfig - Core config apply handler bound to the runtime path.
 * @param configPath - Runtime config file path (for restart detection).
 */
export function registerConfigApplyRoute(
  app: FastifyInstance,
  applyConfig?: ConfigApplyHandler,
  configPath?: string,
): void {
  app.post(getEndpoint('configApply').path, async (request, reply) => {
    if (!applyConfig || !configPath) {
      return reply
        .status(500)
        .send({ error: 'No runtime config path available' });
    }

    const body = request.body as Record<string, unknown> | null | undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply
        .status(400)
        .send({ error: 'Request body must be a JSON object' });
    }

    const { patch, replace } = body as { patch: unknown; replace?: unknown };

    if (
      patch === null ||
      patch === undefined ||
      typeof patch !== 'object' ||
      Array.isArray(patch)
    ) {
      return reply
        .status(400)
        .send({ error: '`patch` must be a non-null object' });
    }

    if (replace !== undefined && typeof replace !== 'boolean') {
      return reply
        .status(400)
        .send({ error: '`replace` must be a boolean if provided' });
    }

    const previous = readEffectiveConfig(configPath);

    const result = await applyConfig({
      patch: patch as Record<string, unknown>,
      replace,
    });

    if (result.status !== 200) {
      return reply.status(result.status).send(result.body);
    }

    // Never echo the resolved config: it may hold secrets (gatewayApiKey).
    const { config: next = {}, warning } = result.body as AppliedBody;

    const restartRequired = RESTART_REQUIRED_FIELDS.some(
      (field) =>
        JSON.stringify(previous[field]) !== JSON.stringify(next[field]),
    );

    return reply.status(200).send({
      applied: true,
      ...(warning ? { warning } : {}),
      restartRequired,
    });
  });
}
