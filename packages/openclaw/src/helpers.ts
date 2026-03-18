/**
 * Shared types and utilities for the OpenClaw plugin.
 *
 * @module helpers
 */

/** Minimal OpenClaw plugin API surface. */
export interface PluginApi {
  config?: {
    plugins?: {
      entries?: Record<string, { config?: Record<string, unknown> }>;
    };
    agents?: {
      defaults?: {
        workspace?: string;
      };
    };
  };
  resolvePath?: (input: string) => string;
  registerTool(
    tool: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (
        id: string,
        params: Record<string, unknown>,
      ) => Promise<ToolResult>;
    },
    options?: { optional?: boolean },
  ): void;
}

/** Tool result shape. */
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** Plugin identifier. */
const PLUGIN_ID = 'jeeves-meta-openclaw';

/** Get plugin config object from the OpenClaw API. */
function getPluginConfig(api: PluginApi): Record<string, unknown> | undefined {
  return api.config?.plugins?.entries?.[PLUGIN_ID]?.config;
}

/**
 * Resolve a plugin setting via the standard three-step fallback chain:
 * plugin config → environment variable → default value.
 *
 * @param api - Plugin API.
 * @param configKey - Key in the plugin config object.
 * @param envVar - Environment variable name.
 * @param fallback - Default value if neither source provides one.
 */
export function resolvePluginSetting(
  api: PluginApi,
  configKey: string,
  envVar: string,
  fallback: string,
): string {
  const fromPlugin = getPluginConfig(api)?.[configKey];
  if (typeof fromPlugin === 'string') return fromPlugin;

  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;

  return fallback;
}

/** Resolve the meta service URL. */
export function getServiceUrl(api: PluginApi): string {
  return resolvePluginSetting(
    api,
    'serviceUrl',
    'JEEVES_META_URL',
    'http://127.0.0.1:1938',
  );
}

/** Resolve the platform config root. */
export function getConfigRoot(api: PluginApi): string {
  return resolvePluginSetting(
    api,
    'configRoot',
    'JEEVES_CONFIG_ROOT',
    'j:/config',
  );
}

/** Format a successful tool result. */
export function ok(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/** Format an error tool result. */
export function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: 'Error: ' + message }],
    isError: true,
  };
}
