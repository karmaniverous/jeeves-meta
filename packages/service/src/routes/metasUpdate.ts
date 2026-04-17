/**
 * PATCH /metas/:path — update user-settable reserved properties on a meta.
 *
 * Supported fields: _steer, _emphasis, _depth, _crossRefs, _disabled.
 * Set a field to null to remove it. Unknown keys are rejected.
 *
 * @module routes/metasUpdate
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { resolveMetaDir } from '../lock.js';
import { normalizePath } from '../normalizePath.js';
import { readMetaJson } from '../readMetaJson.js';
import { DEFAULT_EXCLUDE_FIELDS, type RouteDeps } from './index.js';

const updateBodySchema = z
  .object({
    _steer: z.union([z.string(), z.null()]).optional(),
    _emphasis: z.union([z.number().min(0), z.null()]).optional(),
    _depth: z.union([z.number(), z.null()]).optional(),
    _crossRefs: z.union([z.array(z.string()), z.null()]).optional(),
    _disabled: z.union([z.boolean(), z.null()]).optional(),
  })
  .strict();

export function registerMetasUpdateRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  void deps; // Signature matches other route registrars; deps unused for direct-read route

  app.patch<{ Params: { path: string } }>(
    '/metas/:path',
    async (request, reply) => {
      const parseResult = updateBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: parseResult.error.message,
        });
      }
      const updates = parseResult.data;

      const targetPath = normalizePath(decodeURIComponent(request.params.path));
      const metaDir = resolveMetaDir(targetPath);

      let meta: Record<string, unknown>;
      try {
        meta = (await readMetaJson(metaDir)) as Record<string, unknown>;
      } catch {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Meta path not found: ' + targetPath,
        });
      }

      const metaJsonPath = join(metaDir, 'meta.json');

      const KEYS = [
        '_steer',
        '_emphasis',
        '_depth',
        '_crossRefs',
        '_disabled',
      ] as const;
      const toDelete = new Set<string>();
      const toSet: Record<string, unknown> = {};
      for (const key of KEYS) {
        const value = updates[key];
        if (value === null) {
          toDelete.add(key);
        } else if (value !== undefined) {
          toSet[key] = value;
        }
      }
      const updated: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(meta)) {
        if (!toDelete.has(k)) updated[k] = v;
      }
      Object.assign(updated, toSet);

      await writeFile(metaJsonPath, JSON.stringify(updated, null, 2) + '\n');

      // Project the response — exclude the same large fields as the detail route.
      const projected: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updated)) {
        if (!DEFAULT_EXCLUDE_FIELDS.has(k)) projected[k] = v;
      }

      return reply.send({
        path: metaDir,
        meta: projected,
      });
    },
  );
}
