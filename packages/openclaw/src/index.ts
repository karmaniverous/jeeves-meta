/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Thin HTTP client — all operations delegate to the jeeves-meta service.
 * The plugin registers tools and uses `@karmaniverous/jeeves` core to
 * manage TOOLS.md section writing and platform content maintenance.
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
  type ServiceStatus,
} from '@karmaniverous/jeeves';

import { getConfigRoot, getServiceUrl, type PluginApi } from './helpers.js';
import { generateMetaMenu } from './promptInjection.js';
import { MetaServiceClient } from './serviceClient.js';
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
 * Resolve the workspace path from the plugin API.
 * Falls back to CWD if `api.resolvePath` is not available.
 */
function resolveWorkspacePath(api: PluginApi): string {
  const resolvePath = (api as unknown as Record<string, unknown>)
    .resolvePath as ((input: string) => string) | undefined;
  return typeof resolvePath === 'function' ? resolvePath('.') : process.cwd();
}

/** Build ServiceCommands backed by the meta service HTTP client. */
function buildServiceCommands(client: MetaServiceClient): {
  stop: () => Promise<void>;
  uninstall: () => Promise<void>;
  status: () => Promise<ServiceStatus>;
} {
  return {
    async stop() {
      // Meta service lifecycle is managed externally (NSSM).
    },
    async uninstall() {
      // Service uninstall is handled by the service CLI.
    },
    async status(): Promise<ServiceStatus> {
      try {
        const res = await client.status();
        return {
          running: res.status !== 'stopped',
          version: res.version,
          uptimeSeconds: res.uptime,
        };
      } catch {
        return { running: false };
      }
    },
  };
}

/** Register all jeeves-meta tools with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  const client = new MetaServiceClient({ serviceUrl: getServiceUrl(api) });

  registerMetaTools(api, client);

  init({
    workspacePath: resolveWorkspacePath(api),
    configRoot: getConfigRoot(api),
  });

  const writer = createComponentWriter({
    name: 'meta',
    version: PLUGIN_VERSION,
    sectionId: 'Meta',
    refreshIntervalSeconds: 73,
    generateToolsContent: createAsyncContentCache({
      fetch: async () => generateMetaMenu(client),
      placeholder:
        'The jeeves-meta synthesis engine is initializing...\n\n' +
        renderToolsTable(),
    }),
    serviceCommands: buildServiceCommands(client),
    pluginCommands: {
      async uninstall() {
        // Plugin uninstall is handled by the CLI.
      },
    },
  });

  writer.start();
}
