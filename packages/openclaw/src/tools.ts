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

import { type ConfigRootGate, requireConfigRoot } from './configRoot.js';
import { buildCustomTools } from './customTools.js';
import type { MetaServiceClient } from './serviceClient.js';

/**
 * Tools that need core `init()` (and therefore `configRoot`).
 *
 * `meta_service` resolves the component config path for `install`.
 * Every other tool only talks HTTP to the meta service.
 */
const CONFIG_ROOT_TOOLS = new Set(['meta_service']);

/** Register all meta_* tools (standard + custom). */
export function registerMetaTools(
  api: PluginApi,
  client: MetaServiceClient,
  descriptor: JeevesComponentDescriptor,
  gate: ConfigRootGate,
): void {
  const baseUrl = client.getBaseUrl();

  // Standard tools from factory: meta_status, meta_config, meta_config_apply, meta_service
  for (const tool of createPluginToolset(descriptor)) {
    api.registerTool(
      CONFIG_ROOT_TOOLS.has(tool.name) ? requireConfigRoot(tool, gate) : tool,
    );
  }

  // Custom domain-specific tools
  for (const tool of buildCustomTools(client, baseUrl)) {
    api.registerTool(tool);
  }
}
