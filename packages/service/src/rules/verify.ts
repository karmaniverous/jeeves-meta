/**
 * Post-registration verification of virtual rule application.
 *
 * After rules are registered with the watcher, verifies that .meta/meta.json
 * files are discoverable via watcher walk (which depends on virtual rules
 * being applied). Logs a warning if expected metas are not found.
 *
 * @module rules/verify
 */

import { discoverMetas } from '../discovery/discoverMetas.js';
import type { WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';

/**
 * Verify that virtual rules are applied to indexed .meta/meta.json files.
 *
 * Runs a discovery pass and logs the result. If no metas are found but
 * the filesystem likely has some, logs a warning suggesting reindex.
 *
 * @param watcher - WatcherClient for discovery.
 * @param logger - Logger for reporting results.
 * @returns Number of metas discovered.
 */
export async function verifyRuleApplication(
  watcher: WatcherClient,
  logger: MinimalLogger,
): Promise<number> {
  try {
    const metaPaths = await discoverMetas(watcher);

    if (metaPaths.length === 0) {
      logger.warn(
        { count: 0 },
        'Post-registration verification: no .meta/meta.json files found via watcher walk. ' +
          'Virtual rules may not be applied to indexed files. ' +
          'If metas exist, a path-scoped reindex may be needed.',
      );
    } else {
      logger.info(
        { count: metaPaths.length },
        'Post-registration verification: metas discoverable',
      );
    }

    return metaPaths.length;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Post-registration verification failed (watcher may be unavailable)',
    );
    return 0;
  }
}
