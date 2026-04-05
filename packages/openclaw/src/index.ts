/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Thin HTTP client — all operations delegate to the jeeves-meta service.
 * Uses `@karmaniverous/jeeves` core for TOOLS.md and platform content.
 *
 * @packageDocumentation
 */

import {
  createAsyncContentCache,
  createComponentWriter,
  getPackageVersion,
  init,
  type JeevesComponentDescriptor,
  jeevesComponentDescriptorSchema,
  loadWorkspaceConfig,
  type PluginApi,
  resolveWorkspacePath,
  WORKSPACE_CONFIG_DEFAULTS,
} from '@karmaniverous/jeeves';

import { getConfigRoot, getServiceUrl } from './helpers.js';
import { generateMetaMenu } from './promptInjection.js';
import { MetaServiceClient } from './serviceClient.js';
import { registerMetaTools } from './tools.js';

/** Register all jeeves-meta tools with the OpenClaw plugin API. */
export default function register(api: PluginApi): void {
  const client = new MetaServiceClient({ apiUrl: getServiceUrl(api) });

  const workspacePath = resolveWorkspacePath(api);

  init({
    workspacePath,
    configRoot: getConfigRoot(api),
  });

  const gatewayUrl =
    loadWorkspaceConfig(workspacePath)?.core?.gatewayUrl ??
    WORKSPACE_CONFIG_DEFAULTS.core.gatewayUrl;

  const placeholder =
    'The jeeves-meta synthesis engine is initializing...\n\n' +
    'Read the `jeeves-meta` skill for usage guidance, configuration, and troubleshooting.';

  const getContent = createAsyncContentCache({
    fetch: async () => generateMetaMenu(client),
    placeholder,
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (/HTTP 503\b/i.test(msg) || /scan.in.progress/i.test(msg)) {
        console.warn(
          '[jeeves-meta] Watcher scan still in progress — will retry on next refresh cycle.',
        );
        return;
      }
      console.warn('[jeeves-meta] Content fetch failed:', msg);
    },
  });

  const descriptor: JeevesComponentDescriptor =
    jeevesComponentDescriptorSchema.parse({
      name: 'meta',
      version: getPackageVersion(import.meta.url),
      servicePackage: '@karmaniverous/jeeves-meta',
      pluginPackage: '@karmaniverous/jeeves-meta-openclaw',
      defaultPort: 1938,
      // The runtime Zod custom validator only checks for a .parse() method.
      // Use unknown cast to bridge the Zod v4 (service) → v3 (core SDK) type gap.
      configSchema: { parse: (v: unknown) => v } as unknown,
      configFileName: 'config.json',
      initTemplate: () => ({}),
      startCommand: (configPath: string) => [
        'node',
        'dist/cli.js',
        'start',
        '-c',
        configPath,
      ],
      // Plugin-side descriptor is only used by ComponentWriter for managed
      // content. The real run callback lives in the service descriptor.
      run: () => {
        return Promise.reject(
          new Error('run() is not available on the plugin-side descriptor'),
        );
      },
      sectionId: 'Meta',
      refreshIntervalSeconds: 73,
      generateToolsContent: getContent,
      dependencies: { hard: ['watcher'], soft: [] },
    });

  registerMetaTools(api, client, descriptor);

  const writer = createComponentWriter(descriptor, { gatewayUrl });

  writer.start();
}
