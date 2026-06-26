/**
 * Zod schema for the jeeves-meta OpenClaw plugin configuration.
 *
 * This is the source of truth for the plugin configSchema.
 * The build-time script `scripts/generate-plugin-schema.mjs` derives
 * the JSON Schema in `openclaw.plugin.json` from this definition.
 *
 * @module pluginConfigSchema
 */

import { z } from 'zod';

/** Zod schema for the jeeves-meta OpenClaw plugin configuration. */
export const pluginConfigSchema = z.object({
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

/** Inferred type for the plugin configuration. */
export type PluginConfig = z.infer<typeof pluginConfigSchema>;
