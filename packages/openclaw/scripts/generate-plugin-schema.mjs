/**
 * Generates the configSchema in openclaw.plugin.json from the Zod schema.
 *
 * Run via: node scripts/generate-plugin-schema.mjs
 * Wired into build via the generate-schema npm script (called before build:plugin).
 *
 * The Zod schema is defined inline here to avoid requiring TypeScript compilation
 * before this script runs. Keep in sync with src/pluginConfigSchema.ts.
 */

/* global console */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toJSONSchema, z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_JSON = path.join(ROOT, 'openclaw.plugin.json');

// Mirror of src/pluginConfigSchema.ts — keep in sync.
const schema = z.object({
  apiUrl: z
    .string()
    .default('http://127.0.0.1:1938')
    .describe(
      'URL of the jeeves-meta HTTP service. Falls back to JEEVES_META_URL env var.',
    ),
  configRoot: z
    .string()
    .optional()
    .describe(
      'Absolute path to the platform config root (e.g. j:/config). Used by @karmaniverous/jeeves core for config directory resolution.',
    ),
});

// Generate JSON Schema from Zod
const jsonSchema = toJSONSchema(schema);

// Remove $schema — not needed in plugin.json
delete jsonSchema.$schema;

// Remove required array — the plugin config UI does not use required,
// and the hand-written schema had no required field.
delete jsonSchema.required;

// Patch plugin.json in place
const plugin = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
plugin.configSchema = jsonSchema;
writeFileSync(PLUGIN_JSON, JSON.stringify(plugin, null, 2) + '\n');

console.log('Generated configSchema in openclaw.plugin.json');
