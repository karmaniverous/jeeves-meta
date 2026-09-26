/**
 * Jeeves component descriptor for jeeves-meta.
 *
 * Single source of truth consumed by the service CLI and the config-apply
 * pipeline.
 *
 * @module descriptor
 */

import {
  type JeevesComponentDescriptor,
  jeevesComponentDescriptorSchema,
} from '@karmaniverous/jeeves';
import { META_COMPONENT } from '@karmaniverous/jeeves-meta-core';

import { startService } from './bootstrap.js';
import { applyHotReloadedConfig } from './configHotReload.js';
import { loadServiceConfig } from './configLoader.js';
import { SERVICE_VERSION } from './constants.js';
import { registerCustomCliCommands } from './customCliCommands.js';
import { serviceConfigSchema } from './schema/config.js';

/**
 * Parsed jeeves-meta component descriptor.
 */
export const metaDescriptor: JeevesComponentDescriptor =
  jeevesComponentDescriptorSchema.parse({
    name: META_COMPONENT.name,
    version: SERVICE_VERSION,
    servicePackage: META_COMPONENT.servicePackage,
    pluginPackage: META_COMPONENT.pluginPackage,
    defaultPort: META_COMPONENT.defaultPort,
    configSchema: serviceConfigSchema,
    configFileName: 'config.json',
    initTemplate: () =>
      serviceConfigSchema.parse({
        watcherUrl: 'http://127.0.0.1:1936',
      }) as unknown as Record<string, unknown>,
    onConfigApply: (merged: Record<string, unknown>) => {
      const parsed = serviceConfigSchema.parse(merged);
      applyHotReloadedConfig(parsed);
      return Promise.resolve();
    },
    run: async (configPath: string) => {
      const config = loadServiceConfig(configPath);
      await startService(config, configPath);
    },
    startCommand: (configPath: string) => [
      'node',
      'dist/cli/jeeves-meta/index.js',
      'start',
      '-c',
      configPath,
    ],
    customCliCommands: registerCustomCliCommands,
  });

// Re-export for convenience
export { loadServiceConfig };
