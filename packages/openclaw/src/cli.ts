/**
 * CLI for installing/uninstalling the jeeves-meta OpenClaw plugin.
 *
 * Uses `createPluginCli` from the core SDK for standard install/uninstall.
 *
 * Usage:
 *   npx \@karmaniverous/jeeves-meta-openclaw install
 *   npx \@karmaniverous/jeeves-meta-openclaw uninstall
 *
 * @module cli
 */

import { createPluginCli } from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';

createPluginCli({
  pluginId: PLUGIN_ID,
  importMetaUrl: import.meta.url,
  pluginPackage: '@karmaniverous/jeeves-meta-openclaw',
}).parse();
