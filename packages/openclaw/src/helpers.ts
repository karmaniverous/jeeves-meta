/**
 * Meta-specific convenience wrappers over `@karmaniverous/jeeves` core SDK.
 *
 * @module helpers
 */

import {
  type PluginApi,
  resolveOptionalPluginSetting,
  resolvePluginSetting,
} from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';

/** Environment variable consulted when plugin config has no `configRoot`. */
export const CONFIG_ROOT_ENV = 'JEEVES_CONFIG_ROOT';

/** Error returned by tools that need `configRoot` when it is not set. */
export const CONFIG_ROOT_MISSING_MESSAGE = `configRoot not configured — set it in plugin config (plugins.entries.${PLUGIN_ID}.config.configRoot) or via the ${CONFIG_ROOT_ENV} env var`;

/** Resolve the meta service URL. */
export function getServiceUrl(api: PluginApi): string {
  return resolvePluginSetting(
    api,
    PLUGIN_ID,
    'apiUrl',
    'JEEVES_META_URL',
    'http://127.0.0.1:1938',
  );
}

/**
 * Resolve the platform config root without throwing.
 *
 * Order: the plugin's own config (`api.pluginConfig`), then
 * `plugins.entries.<id>.config`, then the `JEEVES_CONFIG_ROOT` env var.
 *
 * @returns The config root, or `undefined` when none is set.
 */
export function resolveConfigRoot(api: PluginApi): string | undefined {
  const own = api.pluginConfig?.['configRoot'];
  if (typeof own === 'string' && own) return own;

  return (
    resolveOptionalPluginSetting(
      api,
      PLUGIN_ID,
      'configRoot',
      CONFIG_ROOT_ENV,
    ) || undefined
  );
}
