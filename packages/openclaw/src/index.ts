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
} from '@karmaniverous/jeeves';

import { getConfigRoot, getServiceUrl, type PluginApi } from './helpers.js';
import { generateMetaMenu } from './promptInjection.js';
import { MetaServiceClient } from './serviceClient.js';
import {
  createPluginCommands,
  createServiceCommands,
} from './serviceCommands.js';
import { renderToolsTable } from './toolMeta.js';
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

/**
 * Resolve the workspace path from the OpenClaw plugin API.
 * Falls back to CWD if `api.resolvePath` is unavailable.
 */
function resolveWorkspacePath(api: PluginApi): string {
  const resolvePath = (api as unknown as Record<string, unknown>)
    .resolvePath as ((input: string) => string) | undefined;
  return typeof resolvePath === 'function' ? resolvePath('.') : process.cwd();
}

/** Register all jeeves-meta tools with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  const client = new MetaServiceClient({ serviceUrl: getServiceUrl(api) });

  registerMetaTools(api, client);

  init({
    workspacePath: resolveWorkspacePath(api),
    configRoot: getConfigRoot(api),
  });

  const getContent = createAsyncContentCache({
    fetch: async () => generateMetaMenu(client),
    placeholder:
      'The jeeves-meta synthesis engine is initializing...\n\n' +
      renderToolsTable(),
  });

  const writer = createComponentWriter({
    name: 'meta',
    version: PLUGIN_VERSION,
    sectionId: 'Meta',
    refreshIntervalSeconds: 73,
    generateToolsContent: getContent,
    serviceCommands: createServiceCommands(client),
    pluginCommands: createPluginCommands(),
  });

  writer.start();
}
