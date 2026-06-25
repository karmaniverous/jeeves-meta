/**
 * Load and resolve jeeves-meta service config.
 *
 * Supports environment-variable substitution (dollar-brace pattern).
 *
 * @module configLoader
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type ServiceConfig, serviceConfigSchema } from './schema/config.js';

/**
 * Deep-walk a value, replacing `\${VAR\}` patterns with process.env values.
 *
 * @param value - Arbitrary JSON-compatible value.
 * @returns Value with env-var placeholders resolved.
 */
function substituteEnvVars(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_match, name: string) => {
      const envVal = process.env[name];
      if (envVal === undefined) {
        throw new Error(`Environment variable ${name} is not set`);
      }
      return envVal;
    });
  }

  if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteEnvVars(val);
    }
    return result;
  }

  return value;
}

/**
 * Migrate legacy config path to the new canonical location.
 *
 * If the old path `{configRoot}/jeeves-meta.config.json` exists and the new
 * path `{configRoot}/jeeves-meta/config.json` does NOT exist, copies the file
 * to the new location and logs a warning.
 *
 * @param configRoot - Root directory for configuration files.
 * @param warn - Optional callback for logging the migration warning.
 */
export function migrateConfigPath(
  configRoot: string,
  warn?: (msg: string) => void,
): void {
  const oldPath = join(configRoot, 'jeeves-meta.config.json');
  const newDir = join(configRoot, 'jeeves-meta');
  const newPath = join(newDir, 'config.json');

  if (existsSync(oldPath) && !existsSync(newPath)) {
    mkdirSync(newDir, { recursive: true });
    copyFileSync(oldPath, newPath);
    const message = `Migrated config from ${oldPath} to ${newPath}. The old file can be removed.`;
    if (warn) {
      warn(message);
    } else {
      console.warn(`[jeeves-meta] ${message}`);
    }
  }
}

/**
 * Resolve config path from --config flag or JEEVES_META_CONFIG env var.
 *
 * @param args - CLI arguments (process.argv.slice(2)).
 * @returns Resolved config path.
 * @throws If no config path found.
 */
export function resolveConfigPath(args: string[]): string {
  let configIdx = args.indexOf('--config');
  if (configIdx === -1) configIdx = args.indexOf('-c');
  if (configIdx !== -1 && args[configIdx + 1]) {
    return args[configIdx + 1];
  }

  const envPath = process.env['JEEVES_META_CONFIG'];
  if (envPath) return envPath;

  throw new Error(
    'Config path required. Use --config <path> or set JEEVES_META_CONFIG env var.',
  );
}

/**
 * Load service config from a JSON file.
 *
 * Substitutes environment-variable placeholders throughout.
 *
 * @param configPath - Path to config JSON file.
 * @returns Validated ServiceConfig.
 */
export function loadServiceConfig(configPath: string): ServiceConfig {
  const rawText = readFileSync(configPath, 'utf8');
  const raw = substituteEnvVars(JSON.parse(rawText)) as Record<string, unknown>;

  return serviceConfigSchema.parse(raw);
}
