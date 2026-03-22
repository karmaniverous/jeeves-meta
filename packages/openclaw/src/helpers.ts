/**
 * Meta-specific convenience wrappers over `@karmaniverous/jeeves` core SDK.
 *
 * @module helpers
 */

import { type PluginApi, resolvePluginSetting } from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';

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

/** Resolve the platform config root. */
export function getConfigRoot(api: PluginApi): string {
  return resolvePluginSetting(
    api,
    PLUGIN_ID,
    'configRoot',
    'JEEVES_CONFIG_ROOT',
    'j:/config',
  );
}
