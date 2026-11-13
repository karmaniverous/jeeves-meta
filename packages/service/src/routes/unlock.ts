/**
 * `unlock` handler: remove `.lock` from a `.meta/` directory. Deletes a
 * file.
 *
 * @module routes/unlock
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { capArg, MetaNotLocked } from '../api/errors.js';
import type { MetaHandlers } from '../api/handlerTypes.js';
import { resolveMetaDir } from '../lock.js';
import type { RouteDeps } from './index.js';

/**
 * The `unlock` handler.
 *
 * @param deps - Route dependencies.
 * @returns The handler.
 */
export function createUnlockHandlers(
  deps: RouteDeps,
): Pick<MetaHandlers, 'unlock'> {
  return {
    unlock: ({ body }) => {
      const lockPath = join(resolveMetaDir(body.path), '.lock');
      if (!existsSync(lockPath)) throw new MetaNotLocked(capArg(body.path));

      deps.logger.info({ lockPath }, 'removing lock file');
      unlinkSync(lockPath);
      return Promise.resolve({
        status: 200,
        body: { status: 'unlocked', path: body.path },
      });
    },
  };
}
