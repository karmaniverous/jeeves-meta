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

import {
  type ConfigRootGate,
  type NeedsConfigRoot,
  requireConfigRoot,
} from './configRoot.js';
import { buildCustomTools } from './customTools.js';
import type { MetaServiceClient } from './serviceClient.js';

/**
 * Tool calls that read `configRoot`, keyed by tool name.
 *
 * Only `meta_service` with `action: 'install'` reads it: core's service
 * manager resolves the component config path via `getComponentConfigDir()`.
 * The other `meta_service` actions drive the OS service manager by name,
 * and every other tool only talks HTTP to the meta service at `apiUrl`,
 * so none of them are gated.
 */
const CONFIG_ROOT_TOOLS = new Map<string, NeedsConfigRoot>([
  ['meta_service', (params) => params.action === 'install'],
]);

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
    const needsConfigRoot = CONFIG_ROOT_TOOLS.get(tool.name);
    api.registerTool(
      needsConfigRoot ? requireConfigRoot(tool, gate, needsConfigRoot) : tool,
    );
  }

  // Custom domain-specific tools
  for (const tool of buildCustomTools(client, baseUrl)) {
    api.registerTool(tool);
  }
}
