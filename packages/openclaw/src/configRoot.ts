/**
 * Lazy `configRoot` resolution for the jeeves-meta plugin.
 *
 * With a running gateway, `openclaw plugins install` activates the plugin
 * before `jeeves install` writes its config, so `register()` must not
 * depend on `configRoot`. The gate resolves it on first use, initializes
 * core once it is known, and lets tools that need it fail cleanly.
 *
 * @module configRoot
 */

import {
  fail,
  getErrorMessage,
  init,
  type PluginApi,
  resolveWorkspacePath,
  type ToolDescriptor,
} from '@karmaniverous/jeeves';

import {
  CONFIG_ROOT_ENV,
  CONFIG_ROOT_MISSING_MESSAGE,
  resolveConfigRoot,
} from './helpers.js';

/** Result of a gate check: the resolved root, or an error message. */
export type ConfigRootCheck =
  { ok: true; configRoot: string } | { ok: false; error: string };

/** Lazily resolves `configRoot` and initializes core on first success. */
export interface ConfigRootGate {
  /** Resolve `configRoot`, calling core `init()` the first time it resolves. */
  ensure: () => ConfigRootCheck;
}

/** Warning logged once at registration when `configRoot` is unset. */
export const CONFIG_ROOT_WARNING = `[jeeves-meta] configRoot not configured yet — meta_service will be unavailable until it is set in plugin config or ${CONFIG_ROOT_ENV}`;

/**
 * Create a gate over the plugin API.
 *
 * Nothing is resolved or initialized until {@link ConfigRootGate.ensure}
 * is called, so config written after registration is picked up.
 */
export function createConfigRootGate(api: PluginApi): ConfigRootGate {
  let resolved: string | undefined;

  return {
    ensure: () => {
      if (resolved) return { ok: true, configRoot: resolved };

      const configRoot = resolveConfigRoot(api);
      if (!configRoot) return { ok: false, error: CONFIG_ROOT_MISSING_MESSAGE };

      try {
        init({ workspacePath: resolveWorkspacePath(api), configRoot });
      } catch (error: unknown) {
        return {
          ok: false,
          error: `jeeves core init failed: ${getErrorMessage(error)}`,
        };
      }

      resolved = configRoot;
      return { ok: true, configRoot };
    },
  };
}

/** Log {@link CONFIG_ROOT_WARNING} once if `configRoot` cannot be resolved now. */
export function warnIfConfigRootMissing(api: PluginApi): void {
  if (resolveConfigRoot(api)) return;
  const warn =
    api.logger?.warn ??
    ((m: string) => {
      console.warn(m);
    });
  warn(CONFIG_ROOT_WARNING);
}

/** Wrap a tool so it returns a clear error until `configRoot` resolves. */
export function requireConfigRoot(
  tool: ToolDescriptor,
  gate: ConfigRootGate,
): ToolDescriptor {
  return {
    ...tool,
    execute: (id, params) => {
      const check = gate.ensure();
      if (!check.ok) return Promise.resolve(fail(check.error));
      return tool.execute(id, params);
    },
  };
}
