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

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPluginCli } from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';

const thisFile = fileURLToPath(import.meta.url);
const distDir = resolve(dirname(thisFile), '..');

createPluginCli({
  pluginId: PLUGIN_ID,
  distDir,
  pluginPackage: '@karmaniverous/jeeves-meta-openclaw',
}).parse();
