/**
 * Static checks on the published plugin manifest and skill.
 *
 * @module manifest.test
 */

import { readFileSync } from 'node:fs';

import { validateSkillFrontmatter } from '@karmaniverous/jeeves';
import { describe, expect, it } from 'vitest';

interface Manifest {
  id: string;
  skills: string[];
  configSchema: {
    additionalProperties: boolean;
    properties: Record<string, Record<string, unknown>>;
  };
}

const manifest = JSON.parse(
  readFileSync('openclaw.plugin.json', 'utf-8'),
) as Manifest;

describe('openclaw.plugin.json', () => {
  it('declares configRoot without a default', () => {
    const { configRoot } = manifest.configSchema.properties;
    expect(configRoot).toMatchObject({ type: 'string' });
    expect(configRoot).not.toHaveProperty('default');
  });

  it('declares apiUrl with the local default port', () => {
    expect(manifest.configSchema.properties['apiUrl']).toMatchObject({
      type: 'string',
      default: 'http://127.0.0.1:1938',
    });
  });

  it('rejects unknown config keys', () => {
    expect(manifest.configSchema.additionalProperties).toBe(false);
  });

  it('ships the jeeves-meta skill from dist', () => {
    expect(manifest.skills).toEqual(['dist/skills/jeeves-meta']);
  });
});

/**
 * OpenClaw cuts every catalog description to a compact form once the full
 * skills catalog exceeds `skills.limits.maxSkillsPromptChars`, so the
 * description stays short: trigger words, no filler.
 */
const MAX_DESCRIPTION_CHARS = 160;

describe('skills/jeeves-meta/SKILL.md', () => {
  const content = readFileSync('skills/jeeves-meta/SKILL.md', 'utf-8');

  it('has name and description frontmatter', () => {
    expect(validateSkillFrontmatter(content)).toMatchObject({
      name: 'jeeves-meta',
    });
  });

  it(`keeps its description within ${String(MAX_DESCRIPTION_CHARS)} characters`, () => {
    expect(
      validateSkillFrontmatter(content).description.length,
    ).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
  });
});
