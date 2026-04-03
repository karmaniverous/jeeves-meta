/**
 * Shared live config hot-reload support.
 *
 * Used by both file-watch reloads in bootstrap and POST /config/apply
 * via the component descriptor's onConfigApply callback.
 *
 * @module configHotReload
 */

import type { Logger } from 'pino';

import type { Scheduler } from './scheduler/index.js';
import type { ServiceConfig } from './schema/config.js';

/**
 * Fields that require a service restart to take effect.
 *
 * Shared between the descriptor's `onConfigApply` and the file-watcher
 * hot-reload in `bootstrap.ts`.
 */
export const RESTART_REQUIRED_FIELDS = [
  'port',
  'watcherUrl',
  'gatewayUrl',
  'gatewayApiKey',
  'defaultArchitect',
  'defaultCritic',
] as const;

interface ConfigHotReloadRuntime {
  config: ServiceConfig;
  logger: Logger;
  scheduler: Scheduler | null;
}

let runtime: ConfigHotReloadRuntime | null = null;

/** Register the active service runtime for config-apply hot reload. */
export function registerConfigHotReloadRuntime(
  nextRuntime: ConfigHotReloadRuntime,
): void {
  runtime = nextRuntime;
}

/** Clear the registered runtime. Primarily for tests. */
export function clearConfigHotReloadRuntime(): void {
  runtime = null;
}

/** Apply hot-reloadable config changes to the live shared config object. */
export function applyHotReloadedConfig(newConfig: ServiceConfig): void {
  if (!runtime) return;

  const { config, logger, scheduler } = runtime;

  for (const field of RESTART_REQUIRED_FIELDS) {
    const oldVal = config[field];
    const nextVal = newConfig[field];
    if (oldVal !== nextVal) {
      logger.warn(
        { field, oldValue: oldVal, newValue: nextVal },
        'Config field changed but requires restart to take effect',
      );
    }
  }

  if (newConfig.schedule !== config.schedule) {
    scheduler?.updateSchedule(newConfig.schedule);
    config.schedule = newConfig.schedule;
    logger.info({ schedule: newConfig.schedule }, 'Schedule hot-reloaded');
  }

  if (newConfig.logging.level !== config.logging.level) {
    logger.level = newConfig.logging.level;
    config.logging.level = newConfig.logging.level;
    logger.info({ level: newConfig.logging.level }, 'Log level hot-reloaded');
  }

  const restartSet = new Set<string>(RESTART_REQUIRED_FIELDS);
  for (const key of Object.keys(newConfig)) {
    if (restartSet.has(key) || key === 'logging' || key === 'schedule') {
      continue;
    }

    const oldVal = (config as Record<string, unknown>)[key];
    const nextVal = (newConfig as Record<string, unknown>)[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(nextVal)) {
      (config as Record<string, unknown>)[key] = nextVal;
      logger.info({ field: key }, 'Config field hot-reloaded');
    }
  }
}
