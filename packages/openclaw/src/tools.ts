/**
 * Meta tool registrations for OpenClaw.
 *
 * Standard tools (status, config, config_apply, service) are produced
 * by `createPluginToolset()`. Custom domain-specific tools are
 * registered here alongside them.
 *
 * @module tools
 */

import {
  createPluginToolset,
  type JeevesComponentDescriptor,
  type PluginApi,
} from '@karmaniverous/jeeves';

import { buildCustomTools } from './customTools.js';
import type { MetaServiceClient } from './serviceClient.js';

/** Register all meta_* tools (standard + custom). */
export function registerMetaTools(
  api: PluginApi,
  client: MetaServiceClient,
  descriptor: JeevesComponentDescriptor,
): void {
  const baseUrl = client.getBaseUrl();

  // Standard tools from factory: meta_status, meta_config, meta_config_apply, meta_service
  for (const tool of createPluginToolset(descriptor)) {
    api.registerTool(tool);
  }

  // Custom domain-specific tools
  for (const tool of buildCustomTools(client, baseUrl)) {
    api.registerTool(tool);
  }
}
