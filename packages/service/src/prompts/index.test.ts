import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  getDefaultArchitectPrompt,
  getDefaultCriticPrompt,
  getPromptDir,
  resolvePromptDir,
} from './index.js';

const srcPromptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(srcPromptDir, '..', '..');

describe('built-in prompts', () => {
  it('load from src/prompts when running from source', () => {
    expect(getPromptDir()).toBe(srcPromptDir);
  });

  it.each([
    ['architect.md', getDefaultArchitectPrompt],
    ['critic.md', getDefaultCriticPrompt],
  ])('%s loads unchanged and non-empty', (file, load) => {
    const loaded = load();
    expect(loaded.trim().length).toBeGreaterThan(0);
    expect(loaded).toBe(readFileSync(join(srcPromptDir, file), 'utf8'));
  });

  it('caches prompts after first load', () => {
    expect(getDefaultArchitectPrompt()).toBe(getDefaultArchitectPrompt());
  });
});

describe('resolvePromptDir', () => {
  it('maps a module under src/ to src/prompts', () => {
    expect(
      resolvePromptDir(join(packageRoot, 'src', 'prompts', 'index.ts')),
    ).toBe(join(packageRoot, 'src', 'prompts'));
  });

  it('maps the bundled CLI module to dist/prompts', () => {
    expect(
      resolvePromptDir(
        join(packageRoot, 'dist', 'cli', 'jeeves-meta', 'index.js'),
      ),
    ).toBe(join(packageRoot, 'dist', 'prompts'));
  });
});
