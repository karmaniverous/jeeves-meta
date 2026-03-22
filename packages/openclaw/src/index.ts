/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Thin HTTP client — all operations delegate to the jeeves-meta service.
 * Uses `@karmaniverous/jeeves` core for TOOLS.md and platform content.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAsyncContentCache,
  createComponentWriter,
  init,
  type PluginApi,
  resolveWorkspacePath,
} from '@karmaniverous/jeeves';

import { getConfigRoot, getServiceUrl } from './helpers.js';
import { generateMetaMenu } from './promptInjection.js';
import { MetaServiceClient } from './serviceClient.js';
import {
  createPluginCommands,
  createServiceCommands,
} from './serviceCommands.js';
import { registerMetaTools } from './tools.js';

/** Plugin version derived from package.json. */
const PLUGIN_VERSION: string = (() => {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(
      readFileSync(resolve(dir, '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
})();

/** Register all jeeves-meta tools with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  const client = new MetaServiceClient({ apiUrl: getServiceUrl(api) });

  registerMetaTools(api, client);

  init({
    workspacePath: resolveWorkspacePath(api),
    configRoot: getConfigRoot(api),
  });

  const getContent = createAsyncContentCache({
    fetch: async () => generateMetaMenu(client),
    placeholder:
      'The jeeves-meta synthesis engine is initializing...\n\n' +
      'Read the `jeeves-meta` skill for usage guidance, configuration, and troubleshooting.',
  });

  const writer = createComponentWriter({
    name: 'meta',
    version: PLUGIN_VERSION,
    sectionId: 'Meta',
    refreshIntervalSeconds: 73,
    generateToolsContent: getContent,
    serviceCommands: createServiceCommands(client),
    pluginCommands: createPluginCommands(),
    servicePackage: '@karmaniverous/jeeves-meta',
    pluginPackage: '@karmaniverous/jeeves-meta-openclaw',
  });

  writer.start();
}
