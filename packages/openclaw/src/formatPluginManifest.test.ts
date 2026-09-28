/**
 * Tests for the plugin manifest formatter used by generate-plugin-schema.
 *
 * @module formatPluginManifest.test
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { check, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

import { formatPluginManifest } from '../scripts/format-plugin-manifest.mjs';

const MANIFEST_PATH = path.resolve('openclaw.plugin.json');

async function prettierCheck(content: string): Promise<boolean> {
  const config = (await resolveConfig(MANIFEST_PATH)) ?? {};
  return check(content, { ...config, filepath: MANIFEST_PATH });
}

describe('formatPluginManifest', () => {
  it('emits output that passes prettier --check', async () => {
    const manifest = {
      id: 'x',
      skills: ['dist/skills/x'],
      contracts: { tools: ['a', 'b'] },
    };
    const output = await formatPluginManifest(manifest, MANIFEST_PATH);
    expect(await prettierCheck(output)).toBe(true);
    expect(output).toContain('"skills": ["dist/skills/x"]');
    expect(output.endsWith('}\n')).toBe(true);
  });

  it('is byte-identical to the committed manifest (build is a no-op)', async () => {
    const committed = readFileSync(MANIFEST_PATH, 'utf-8');
    const output = await formatPluginManifest(
      JSON.parse(committed) as unknown,
      MANIFEST_PATH,
    );
    expect(output).toBe(committed);
  });

  it('is idempotent', async () => {
    const once = await formatPluginManifest({ a: [1, 2] }, MANIFEST_PATH);
    const twice = await formatPluginManifest(
      JSON.parse(once) as unknown,
      MANIFEST_PATH,
    );
    expect(twice).toBe(once);
  });
});
