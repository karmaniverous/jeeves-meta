/**
 * `seed` handler: create a `.meta/` directory with an initial meta.json.
 * Writes files.
 *
 * @module routes/seed
 */

import { capArg, MetaAlreadyExists } from '../api/errors.js';
import type { MetaHandlers } from '../api/handlerTypes.js';
import { createMeta, metaExists } from '../seed/index.js';
import type { RouteDeps } from './index.js';

/**
 * The `seed` handler.
 *
 * @param deps - Route dependencies.
 * @returns The handler.
 */
export function createSeedHandlers(
  deps: RouteDeps,
): Pick<MetaHandlers, 'seed'> {
  return {
    seed: async ({ body }) => {
      if (metaExists(body.path)) throw new MetaAlreadyExists(capArg(body.path));

      deps.logger.info({ path: body.path }, 'seeding .meta directory');
      const result = await createMeta(body.path, {
        crossRefs: body.crossRefs,
        steer: body.steer,
      });

      return {
        status: 201,
        body: {
          status: 'created',
          path: body.path,
          metaDir: result.metaDir,
          _id: result._id,
        },
      };
    },
  };
}
