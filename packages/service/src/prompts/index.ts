/**
 * Built-in default prompts for the synthesis pipeline.
 *
 * Prompts live as `.md` files next to this module in `src/prompts/`. The
 * CLI build copies them into `dist/prompts/` (rollup-plugin-copy), and a
 * build-time assertion verifies the copy.
 *
 * The prompt directory is resolved relative to the executing module, so
 * running from source (e.g. vitest) reads `src/prompts/` and the published
 * bundle reads `dist/prompts/`. Prompts are read lazily on first use, so a
 * missing file surfaces as one clear error instead of an import-time crash.
 *
 * @module prompts
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { packageDirectorySync } from 'package-directory';

/**
 * Resolve the directory holding the built-in prompt files for a module.
 *
 * @param moduleFile - Absolute path of the executing module.
 * @returns `<package root>/src/prompts` when the module lives under
 *   `src/`, otherwise `<package root>/dist/prompts` (published bundle).
 */
export function resolvePromptDir(moduleFile: string): string {
  const packageRoot = packageDirectorySync({ cwd: dirname(moduleFile) });
  if (!packageRoot) {
    throw new Error(
      `jeeves-meta: cannot locate package root for prompt module ${moduleFile}`,
    );
  }
  const [topLevel] = relative(packageRoot, moduleFile).split(sep);
  return join(packageRoot, topLevel === 'src' ? 'src' : 'dist', 'prompts');
}

const cache = new Map<string, string>();

function loadPrompt(file: string): string {
  const cached = cache.get(file);
  if (cached !== undefined) return cached;

  const path = join(getPromptDir(), file);
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`jeeves-meta: built-in prompt not found at ${path}`, {
      cause: err,
    });
  }
  cache.set(file, content);
  return content;
}

/** Directory the built-in prompts are read from for this module. */
export function getPromptDir(): string {
  return resolvePromptDir(fileURLToPath(import.meta.url));
}

/** Built-in default architect prompt (read on first use, then cached). */
export function getDefaultArchitectPrompt(): string {
  return loadPrompt('architect.md');
}

/** Built-in default critic prompt (read on first use, then cached). */
export function getDefaultCriticPrompt(): string {
  return loadPrompt('critic.md');
}
