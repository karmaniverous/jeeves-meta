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

describe('skills/jeeves-meta/SKILL.md', () => {
  it('has name and description frontmatter', () => {
    const content = readFileSync('skills/jeeves-meta/SKILL.md', 'utf-8');
    expect(validateSkillFrontmatter(content)).toMatchObject({
      name: 'jeeves-meta',
    });
  });
});
