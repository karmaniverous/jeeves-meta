/**
 * OpenClaw plugin for jeeves-meta.
 *
 * Thin HTTP client — all operations delegate to the jeeves-meta service.
 * A standard OpenClaw plugin: it writes no workspace files and is installed
 * by `jeeves install` (or `openclaw plugins install`).
 *
 * @packageDocumentation
 */

import {
  getPackageVersion,
  type JeevesComponentDescriptor,
  jeevesComponentDescriptorSchema,
  type PluginApi,
} from '@karmaniverous/jeeves';
import { META_COMPONENT } from '@karmaniverous/jeeves-meta-core';
import { z } from 'zod';

import { createConfigRootGate, warnIfConfigRootMissing } from './configRoot.js';
import { getServiceUrl } from './helpers.js';
import { MetaServiceClient } from './serviceClient.js';
import { registerMetaTools } from './tools.js';

export { type PluginConfig, pluginConfigSchema } from './pluginConfigSchema.js';

/** Build the plugin-side component descriptor used by the standard toolset. */
function buildDescriptor(): JeevesComponentDescriptor {
  return jeevesComponentDescriptorSchema.parse({
    name: META_COMPONENT.name,
    version: getPackageVersion(import.meta.url),
    servicePackage: META_COMPONENT.servicePackage,
    pluginPackage: META_COMPONENT.pluginPackage,
    defaultPort: META_COMPONENT.defaultPort,
    // The plugin never validates service config; the service descriptor does.
    configSchema: z.unknown(),
    configFileName: 'config.json',
    initTemplate: () => ({}),
    startCommand: (configPath: string) => [
      'node',
      'dist/cli.js',
      'start',
      '-c',
      configPath,
    ],
    // The real run callback lives in the service descriptor.
    run: () => {
      return Promise.reject(
        new Error('run() is not available on the plugin-side descriptor'),
      );
    },
  });
}

/**
 * Register all jeeves-meta tools with the OpenClaw plugin API.
 *
 * Always succeeds, even with no plugin config: `configRoot` is resolved
 * lazily when a tool that needs it runs.
 */
export default function register(api: PluginApi): void {
  const client = new MetaServiceClient({ apiUrl: getServiceUrl(api) });

  warnIfConfigRootMissing(api);

  registerMetaTools(api, client, buildDescriptor(), createConfigRootGate(api));
}
