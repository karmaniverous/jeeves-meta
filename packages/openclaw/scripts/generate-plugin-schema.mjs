/**
 * Generates the configSchema in openclaw.plugin.json from the Zod schema.
 *
 * Run via: node scripts/generate-plugin-schema.mjs
 * Wired into build via the generate-schema npm script (called after build:plugin).
 */

/* global console */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toJSONSchema } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_JSON = path.join(ROOT, 'openclaw.plugin.json');

// Import the schema from the built dist output
import { pluginConfigSchema } from '../dist/index.js';

// Generate JSON Schema from Zod
const jsonSchema = toJSONSchema(pluginConfigSchema);

// Remove $schema — not needed in plugin.json
delete jsonSchema.$schema;

// Remove required array — the plugin config UI does not use required,
// and the hand-written schema had no required field.
delete jsonSchema.required;

// Patch plugin.json in place
const plugin = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
plugin.configSchema = jsonSchema;
writeFileSync(PLUGIN_JSON, JSON.stringify(plugin, null, 2) + '\n');

console.log('Generated configSchema in openclaw.plugin.json from src/pluginConfigSchema.ts');
