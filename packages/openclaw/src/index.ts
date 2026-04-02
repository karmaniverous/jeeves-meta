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
  type JeevesComponentDescriptor,
  jeevesComponentDescriptorSchema,
  type PluginApi,
  resolveWorkspacePath,
} from '@karmaniverous/jeeves';

import { getConfigRoot, getServiceUrl } from './helpers.js';
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
  const client = new MetaServiceClient({ apiUrl: getServiceUrl(api) });

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

  const descriptor: JeevesComponentDescriptor =
    jeevesComponentDescriptorSchema.parse({
      name: 'meta',
      version: PLUGIN_VERSION,
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

  const writer = createComponentWriter(descriptor);

  writer.start();
}
