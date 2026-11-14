/**
 * `updateMeta` handler: set or remove user-settable reserved properties of
 * a meta.json. The body is validated by the catalog (`updateBodySchema`,
 * strict). Writes a file.
 *
 * @module routes/metasUpdate
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { updateBodySchema } from '@karmaniverous/jeeves-meta-core';

import { capArg, MetaNotFound } from '../api/errors.js';
import type { MetaHandlers } from '../api/handlerTypes.js';
import { resolveMetaDir } from '../lock.js';
import { normalizePath } from '../normalizePath.js';
import { readMetaJson } from '../readMetaJson.js';
import { DEFAULT_EXCLUDE_FIELDS, type RouteDeps } from './index.js';

/** The user-settable keys `updateMeta` may set or remove. */
const KEYS = Object.keys(updateBodySchema.shape) as Array<
  keyof typeof updateBodySchema.shape
>;

/**
 * The `updateMeta` handler.
 *
 * @param deps - Route dependencies.
 * @returns The handler.
 */
export function createMetasUpdateHandlers(
  deps: RouteDeps,
): Pick<MetaHandlers, 'updateMeta'> {
  return {
    updateMeta: async ({ params, body: updates }) => {
      // Fastify decodes :path once (Decision 202).
      const targetPath = normalizePath(params.path);
      const metaDir = resolveMetaDir(targetPath);

      let meta: Record<string, unknown>;
      try {
        meta = await readMetaJson(metaDir);
      } catch {
        throw new MetaNotFound(capArg(targetPath));
      }

      const toDelete = new Set<string>();
      const toSet: Record<string, unknown> = {};
      for (const key of KEYS) {
        const value = updates[key];
        if (value === null) toDelete.add(key);
        else if (value !== undefined) toSet[key] = value;
      }
      const updated: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(meta)) {
        if (!toDelete.has(k)) updated[k] = v;
      }
      Object.assign(updated, toSet);

      await writeFile(
        join(metaDir, 'meta.json'),
        JSON.stringify(updated, null, 2) + '\n',
      );
      deps.cache.invalidate();

      // Exclude the same large fields as the detail route.
      const projected: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updated)) {
        if (!DEFAULT_EXCLUDE_FIELDS.has(k)) projected[k] = v;
      }

      return { status: 200, body: { path: metaDir, meta: projected } };
    },
  };
}
