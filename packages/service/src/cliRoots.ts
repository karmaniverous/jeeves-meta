/**
 * Workspace and config root for the custom CLI commands, so they can ask
 * jeeves where meta runs (`getServiceUrl('meta')`, which reads the core
 * config under the config root).
 *
 * Each root follows jeeves' shared precedence: the flag, then
 * `JEEVES_WORKSPACE` / `JEEVES_CONFIG_ROOT`, then `core.*` in the
 * workspace's `jeeves.config.json`, then the defaults (`.`, `./config`).
 * jeeves does not export its own resolver, so this composes the exported
 * `loadWorkspaceConfig()` and `resolveConfigValue()` as jeeves-runner does;
 * karmaniverous/jeeves#169 moves this into jeeves.
 *
 * @module cliRoots
 */

import { resolve } from 'node:path';

import {
  init,
  loadWorkspaceConfig,
  rejectWindowsDrivePath,
  resolveConfigValue,
  WORKSPACE_CONFIG_DEFAULTS,
} from '@karmaniverous/jeeves';

/** `-w/--workspace` and `--config-root` as parsed (no commander defaults). */
export interface RootOptions {
  /** Workspace root path flag. */
  workspace?: string;
  /** Platform config root path flag. */
  configRoot?: string;
}

/** Resolved workspace and config root. */
export interface Roots {
  /** Workspace root. */
  workspace: string;
  /** Platform config root. */
  configRoot: string;
}

/**
 * Resolve the workspace and config root by flag, env,
 * `jeeves.config.json`, then default.
 *
 * @param opts - The parsed flags.
 * @param env - Environment to read (default `process.env`).
 * @returns Both roots, as given (not yet made absolute).
 */
export function resolveRoots(
  opts: RootOptions,
  env: NodeJS.ProcessEnv = process.env,
): Roots {
  const defaults = WORKSPACE_CONFIG_DEFAULTS.core;
  const workspaceSeed = resolveConfigValue<string>(
    opts.workspace,
    env['JEEVES_WORKSPACE'],
    undefined,
    defaults.workspace,
  ).value;
  const file = loadWorkspaceConfig(workspaceSeed);
  return {
    workspace: resolveConfigValue<string>(
      opts.workspace,
      env['JEEVES_WORKSPACE'],
      file?.core?.workspace,
      defaults.workspace,
    ).value,
    configRoot: resolveConfigValue<string>(
      opts.configRoot,
      env['JEEVES_CONFIG_ROOT'],
      file?.core?.configRoot,
      defaults.configRoot,
    ).value,
  };
}

/**
 * Resolve both roots and initialise jeeves with them.
 *
 * @param opts - The parsed flags.
 * @param env - Environment to read (default `process.env`).
 */
export function initRoots(
  opts: RootOptions,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const roots = resolveRoots(opts, env);
  // Check the raw values: on Linux, resolve('j:/x') hides the drive letter.
  rejectWindowsDrivePath('configRoot', roots.configRoot);
  rejectWindowsDrivePath('workspacePath', roots.workspace);
  init({
    workspacePath: resolve(roots.workspace),
    configRoot: resolve(roots.configRoot),
  });
}
