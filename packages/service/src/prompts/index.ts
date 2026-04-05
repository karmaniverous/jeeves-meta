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
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageDirectorySync } from 'package-directory';

const packageRoot = packageDirectorySync({
  cwd: fileURLToPath(import.meta.url),
});
const promptDir = join(packageRoot!, 'dist', 'prompts');

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
