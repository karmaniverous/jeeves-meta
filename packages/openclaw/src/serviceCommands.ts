/**
 * ServiceCommands and PluginCommands implementations for the JeevesComponent
 * descriptor. Separated from register() for single-responsibility.
 *
 * @module serviceCommands
 */

import type { PluginCommands, ServiceCommands } from '@karmaniverous/jeeves';

import type { MetaServiceClient, StatusResponse } from './serviceClient.js';

/**
 * Create ServiceCommands that proxy to the meta HTTP service.
 *
 * @param client - MetaServiceClient instance.
 */
export function createServiceCommands(
  client: MetaServiceClient,
): ServiceCommands {
  return {
    async stop() {
      // Meta service lifecycle is managed externally (NSSM).
    },
    async uninstall() {
      // Service uninstall is handled by the service CLI.
    },
    async status() {
      try {
        const res: StatusResponse = await client.status();
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

/** Create PluginCommands (uninstall handled by CLI). */
export function createPluginCommands(): PluginCommands {
  return {
    async uninstall() {
      // Plugin uninstall is handled by the CLI.
    },
  };
}
