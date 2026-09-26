/**
 * Built-in default prompts for the synthesis pipeline.
 *
 * Prompts ship as .md files copied into dist/prompts/ by the CLI build
 * (rollup-plugin-copy).
 * Loaded at runtime relative to the compiled module location.
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
/** Runtime directory of the built-in prompts: `<package root>/dist/prompts`. */
export const PROMPT_DIR = join(packageRoot!, 'dist', 'prompts');

/** Built-in default architect prompt. */
export const DEFAULT_ARCHITECT_PROMPT = readFileSync(
  join(PROMPT_DIR, 'architect.md'),
  'utf8',
);

/** Built-in default critic prompt. */
export const DEFAULT_CRITIC_PROMPT = readFileSync(
  join(PROMPT_DIR, 'critic.md'),
  'utf8',
);
