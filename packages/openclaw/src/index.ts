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
  const serviceUrl = getServiceUrl(api);
  const client = new MetaServiceClient({ serviceUrl });
  const configRoot = getConfigRoot(api);

  registerMetaTools(api, client);

  // Resolve workspace path — api.resolvePath if available, else CWD
  const resolvePath = (api as unknown as Record<string, unknown>)
    .resolvePath as ((input: string) => string) | undefined;
  const workspacePath =
    typeof resolvePath === 'function' ? resolvePath('.') : process.cwd();

  // Initialize jeeves-core
  init({ workspacePath, configRoot });

  // Async content cache — bridges generateMetaMenu (async HTTP) to
  // generateToolsContent (sync interface)
  const getContent = createAsyncContentCache({
    fetch: async () => generateMetaMenu(client),
    placeholder:
      'The jeeves-meta synthesis engine is initializing...\n\n' +
      '### Tools\n' +
      '| Tool | Description |\n' +
      '|------|-------------|\n' +
      '| `meta_list` | List metas with summary stats and per-meta projection |\n' +
      '| `meta_detail` | Full detail for a single meta with optional archive history |\n' +
      '| `meta_trigger` | Manually trigger synthesis for a specific meta or next-stalest |\n' +
      '| `meta_preview` | Dry-run: show what inputs would be gathered without running LLM |\n' +
      '\n' +
      'Read the `jeeves-meta` skill for usage guidance, configuration, and troubleshooting.',
  });

  // Create and start the component writer
  const writer = createComponentWriter({
    name: 'meta',
    version: PLUGIN_VERSION,
    sectionId: 'Meta',
    refreshIntervalSeconds: 73,
    generateToolsContent: getContent,
    serviceCommands: {
      async stop() {
        // Meta service lifecycle is managed externally (NSSM).
      },
      async uninstall() {
        // Service uninstall is handled by the service CLI.
      },
      async status(): Promise<ServiceStatus> {
        try {
          const statusResponse = (await client.status()) as {
            status: string;
            version?: string;
            uptime?: number;
          };
          return {
            running: statusResponse.status !== 'stopped',
            version: statusResponse.version,
            uptimeSeconds: statusResponse.uptime,
          };
        } catch {
          return { running: false };
        }
      },
    },
    pluginCommands: {
      async uninstall() {
        // Plugin uninstall is handled by the CLI.
      },
    },
  });

  writer.start();
}
