/**
 * Jeeves component descriptor for jeeves-meta.
 *
 * Single source of truth consumed by the service CLI, plugin writer, and
 * config-apply pipeline.
 *
 * @module descriptor
 */

import {
  type JeevesComponentDescriptor,
  jeevesComponentDescriptorSchema,
} from '@karmaniverous/jeeves';

import {
  applyHotReloadedConfig,
  RESTART_REQUIRED_FIELDS,
} from './configHotReload.js';
import { loadServiceConfig } from './configLoader.js';
import { SERVICE_VERSION } from './constants.js';
import { registerCustomCliCommands } from './customCliCommands.js';
import { type ServiceConfig, serviceConfigSchema } from './schema/config.js';

// Re-export for consumers that import from descriptor
export { RESTART_REQUIRED_FIELDS };

/**
 * Parsed jeeves-meta component descriptor.
 */
export const metaDescriptor: JeevesComponentDescriptor =
  jeevesComponentDescriptorSchema.parse({
    name: 'meta',
    version: SERVICE_VERSION,
    servicePackage: '@karmaniverous/jeeves-meta',
    pluginPackage: '@karmaniverous/jeeves-meta-openclaw',
    defaultPort: 1938,
    // The runtime Zod custom validator only checks for a .parse() method.
    // Use unknown cast to bridge the Zod v4 (service) → v3 (core SDK) type gap.
    configSchema: serviceConfigSchema as unknown,
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
    startCommand: (configPath: string) => [
      'node',
      'dist/cli/jeeves-meta/index.js',
      'start',
      '-c',
      configPath,
    ],
    sectionId: 'Meta',
    refreshIntervalSeconds: 73,
    generateToolsContent: () => '',
    dependencies: { hard: ['watcher'], soft: [] },
    customCliCommands: registerCustomCliCommands,
  });

// Re-export for convenience
export type { ServiceConfig };
export { loadServiceConfig };
