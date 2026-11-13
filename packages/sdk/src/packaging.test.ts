/**
 * @module packaging.test
 * What the SDK ships and pulls in (Decisions 186, 210): runtime dependencies are exactly jeeves (pinned) and meta-core, sources import only jeeves' catalog sub-path, never Fastify or zod-openapi, and the release config matches the other packages.
 */

import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface Pkg {
  name: string;
  version: string;
  engines: { node: string };
  dependencies: Record<string, string>;
  files: string[];
  'release-it': {
    git: { tagName: string };
    github: { releaseName: string; releaseNotes: string };
    hooks: Record<string, string[]>;
  };
}

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('../package.json')) as Pkg;
const core = JSON.parse(read('../../core/package.json')) as Pkg;

const sources = readdirSync(new URL('.', import.meta.url)).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
);
const imports = sources.flatMap((f) =>
  [...read(`./${f}`).matchAll(/from '([^'.][^']*)'/g)].map((m) => m[1]),
);

describe('packaging', () => {
  it('depends on jeeves (exactly as core does) and meta-core only', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@karmaniverous/jeeves',
      '@karmaniverous/jeeves-meta-core',
    ]);
    expect(pkg.dependencies['@karmaniverous/jeeves']).toBe('0.11.0');
    expect(pkg.dependencies['@karmaniverous/jeeves']).toBe(
      core.dependencies['@karmaniverous/jeeves'],
    );
  });

  it('imports neither Fastify nor zod-openapi, and jeeves only via /catalog', () => {
    expect(new Set(imports)).toEqual(
      new Set([
        '@karmaniverous/jeeves/catalog',
        '@karmaniverous/jeeves-meta-core',
      ]),
    );
  });

  it('ships dist only, for Node 24.22.2 or later', () => {
    expect(pkg.files).toEqual(['dist']);
    expect(pkg.engines.node).toBe('>=24.22.2');
  });

  it('releases as sdk/<version>, like core', () => {
    const release = pkg['release-it'];
    expect(release.git.tagName).toBe('sdk/${version}');
    expect(release.github.releaseName).toBe(
      "${name.split('/').pop()}@${version}",
    );
    expect(release.github.releaseNotes).toBe(
      'npx git-cliff --tag sdk/${version} --unreleased --strip header',
    );
    expect(release.hooks['after:init']).toEqual(
      core['release-it'].hooks['after:init'],
    );
    expect(release.git.tagName.replace('sdk/', 'core/')).toBe(
      core['release-it'].git.tagName,
    );
  });
});
