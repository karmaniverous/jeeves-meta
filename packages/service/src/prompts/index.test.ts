import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARCHITECT_PROMPT,
  DEFAULT_CRITIC_PROMPT,
  PROMPT_DIR,
} from './index.js';

const srcDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(srcDir, '..', '..');

describe('built-in prompts', () => {
  it('load from <package root>/dist/prompts', () => {
    expect(PROMPT_DIR).toBe(join(packageRoot, 'dist', 'prompts'));
  });

  it.each([
    ['architect.md', DEFAULT_ARCHITECT_PROMPT],
    ['critic.md', DEFAULT_CRITIC_PROMPT],
  ])('ship %s unchanged from src/prompts', (file, loaded) => {
    expect(loaded).toBe(readFileSync(join(srcDir, file), 'utf8'));
  });
});
