/**
 * PATCH /metas/:path — update user-settable reserved properties on a meta.
 *
 * Supported fields: _steer, _emphasis, _depth, _crossRefs, _disabled.
 * Set a field to null to remove it. Unknown keys are rejected.
 *
 * @module routes/metasUpdate
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { findNode, listMetas } from '../discovery/index.js';
import { normalizePath } from '../normalizePath.js';
import type { RouteDeps } from './index.js';

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
  app.patch<{ Params: { path: string } }>(
    '/metas/:path',
    async (request, reply) => {
      const { config, watcher } = deps;

      const parseResult = updateBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'BAD_REQUEST',
          message: parseResult.error.message,
        });
      }
      const updates = parseResult.data;

      const targetPath = normalizePath(decodeURIComponent(request.params.path));
      const result = await listMetas(config, watcher);
      const targetNode = findNode(result.tree, targetPath);

      if (!targetNode) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Meta path not found: ' + targetPath,
        });
      }

      const metaJsonPath = join(targetNode.metaPath, 'meta.json');
      const meta = JSON.parse(await readFile(metaJsonPath, 'utf8')) as Record<
        string,
        unknown
      >;

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
      const defaultExclude = new Set([
        '_architect',
        '_builder',
        '_critic',
        '_content',
        '_feedback',
      ]);
      const projected: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updated)) {
        if (!defaultExclude.has(k)) projected[k] = v;
      }

      return reply.send({
        path: targetNode.metaPath,
        meta: projected,
      });
    },
  );
}
