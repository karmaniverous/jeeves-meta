/**
 * POST /config/apply — apply a config patch using the runtime config path.
 *
 * The core SDK's `createConfigApplyHandler` derives the config path from
 * `getComponentConfigDir()` which uses the npm global config root. This
 * local implementation uses the actual runtime config path instead, so
 * temp files are written alongside the active config file.
 *
 * @module routes/configApply
 */

import { readFileSync } from 'node:fs';

import { atomicWrite } from '@karmaniverous/jeeves';
import type { FastifyInstance } from 'fastify';

import {
  applyHotReloadedConfig,
  RESTART_REQUIRED_FIELDS,
} from '../configHotReload.js';
import { serviceConfigSchema } from '../schema/config.js';

/** Register the POST /config/apply route. */
export function registerConfigApplyRoute(
  app: FastifyInstance,
  configPath?: string,
): void {
  app.post('/config/apply', async (request, reply) => {
    if (!configPath) {
      return reply
        .status(500)
        .send({ error: 'No runtime config path available' });
    }

    // Validate request body
    const body = request.body as Record<string, unknown> | null | undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply
        .status(400)
        .send({ error: 'Request body must be a JSON object' });
    }

    const { patch, replace } = body as {
      patch: unknown;
      replace?: unknown;
    };

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

    // Read existing config from the runtime config path
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf8')) as Record<
        string,
        unknown
      >;
    } catch (err) {
      if (
        err instanceof SyntaxError ||
        (err instanceof Error && err.message.includes('JSON'))
      ) {
        return reply.status(400).send({
          error: `Existing config file contains invalid JSON: ${err.message}`,
        });
      }
      // File missing — start from empty
    }

    // Merge or replace
    const merged = replace
      ? { ...(patch as Record<string, unknown>) }
      : { ...existing, ...(patch as Record<string, unknown>) };

    // Validate against schema
    const parseResult = serviceConfigSchema.safeParse(merged);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Config validation failed',
        issues: parseResult.error.issues,
      });
    }

    const validatedConfig = parseResult.data;

    // Write atomically — temp file lands next to the runtime config file
    try {
      const json = JSON.stringify(validatedConfig, null, 2) + '\n';
      atomicWrite(configPath, json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply
        .status(500)
        .send({ error: `Failed to write config: ${message}` });
    }

    // Apply hot-reload callback
    try {
      applyHotReloadedConfig(validatedConfig);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(200).send({
        applied: true,
        warning: `Config written but callback failed: ${message}`,
        restartRequired: RESTART_REQUIRED_FIELDS,
      });
    }

    return reply.status(200).send({
      applied: true,
    });
  });
}
