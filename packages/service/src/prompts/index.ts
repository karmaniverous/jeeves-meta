/**
 * Built-in default prompts for the synthesis pipeline.
 *
 * Prompts ship as .md files bundled into dist/prompts/ via rollup-plugin-copy.
 * Loaded at runtime relative to the compiled module location.
 *
 * Users can override via `defaultArchitect` / `defaultCritic` in the service
 * config. Most installations should use the built-in defaults.
 *
 * @module prompts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const promptDir = dirname(fileURLToPath(import.meta.url));

/** Built-in default architect prompt. */
export const DEFAULT_ARCHITECT_PROMPT = readFileSync(
  join(promptDir, 'architect.md'),
  'utf8',
);

/** Built-in default critic prompt. */
export const DEFAULT_CRITIC_PROMPT = readFileSync(
  join(promptDir, 'critic.md'),
  'utf8',
);
