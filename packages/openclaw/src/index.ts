/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Thin HTTP client — all operations delegate to the jeeves-meta service.
 * The plugin registers tools and uses `@karmaniverous/jeeves` core to
 * manage TOOLS.md section writing and platform content maintenance.
 *
 * @packageDocumentation
 */

import {
  createComponentWriter,
  init,
  type ServiceStatus,
} from '@karmaniverous/jeeves';

import { getConfigRoot, getServiceUrl, type PluginApi } from './helpers.js';
import { generateMetaMenu } from './promptInjection.js';
import { MetaServiceClient } from './serviceClient.js';
import { registerMetaTools } from './tools.js';

/** Plugin version — kept in sync with package.json via release hooks. */
const PLUGIN_VERSION = '0.3.0';

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

  // Create and start the component writer
  const writer = createComponentWriter({
    name: 'meta',
    version: PLUGIN_VERSION,
    sectionId: 'Meta',
    refreshIntervalSeconds: 73,
    generateToolsContent: () => {
      // generateMetaMenu is async but generateToolsContent must be sync.
      // Cache the last successful result and update asynchronously.
      void refreshMenuCache(client);
      return cachedMenu;
    },
    serviceCommands: {
      async stop() {
        // Meta service lifecycle is managed externally (NSSM).
        // This is a no-op from the plugin's perspective.
      },
      async uninstall() {
        // Service uninstall is handled by the service CLI, not the plugin.
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
        // Plugin uninstall is handled by the CLI (npx jeeves-meta-openclaw uninstall).
      },
    },
  });

  writer.start();
}

/** Cached menu content — updated asynchronously. */
let cachedMenu =
  'The jeeves-meta synthesis engine is initializing...\n\n' +
  '### Tools\n' +
  '| Tool | Description |\n' +
  '|------|-------------|\n' +
  '| `meta_list` | List metas with summary stats and per-meta projection |\n' +
  '| `meta_detail` | Full detail for a single meta with optional archive history |\n' +
  '| `meta_trigger` | Manually trigger synthesis for a specific meta or next-stalest |\n' +
  '| `meta_preview` | Dry-run: show what inputs would be gathered without running LLM |\n' +
  '\n' +
  'Read the `jeeves-meta` skill for usage guidance, configuration, and troubleshooting.';

/** Whether a refresh is currently in flight. */
let refreshInFlight = false;

/**
 * Refresh the cached menu from the meta service.
 * Deduplicates concurrent calls — only one fetch runs at a time.
 */
async function refreshMenuCache(client: MetaServiceClient): Promise<void> {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    cachedMenu = await generateMetaMenu(client);
  } catch {
    // Keep the previous cached value on failure.
  } finally {
    refreshInFlight = false;
  }
}
