/**
 * @module openapi.test
 * The committed OpenAPI document: in step with `META_CATALOG` (drift), a
 * valid OpenAPI 3.1 document with one operation per entry and no security,
 * carrying the core version, exported and published as a sub-path; and
 * core stays free of Fastify and zod-openapi at runtime.
 */

import { readFileSync } from 'node:fs';

import { checkOpenApiDrift } from '@karmaniverous/jeeves/openapi';
import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';

import { OPENAPI_FILE, openApiInfo } from '../scripts/openapiInfo.js';
import { META_CATALOG } from './catalog.js';
import * as root from './index.js';
import { META_OPENAPI_DOCUMENT } from './openapi.js';

interface Operation {
  operationId: string;
  security?: unknown[];
}

interface Doc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, Operation>>;
}

const doc = META_OPENAPI_DOCUMENT as unknown as Doc;
const operations = Object.entries(doc.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, op]) => ({ path, method, ...op })),
);

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version: string;
  files: string[];
  exports: Record<string, unknown>;
  dependencies?: Record<string, string>;
  scripts: Record<string, string>;
  'release-it': { hooks: Record<string, string[]> };
};

describe('openapi.json', () => {
  it('matches META_CATALOG (run `npm run openapi` after changing the catalog)', () => {
    const result = checkOpenApiDrift(META_CATALOG, openApiInfo(), OPENAPI_FILE);
    expect(result.diff).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  it('is a valid OpenAPI 3.1 document', async () => {
    expect(doc.openapi).toMatch(/^3\.1\./);
    const result = await new Validator().validate(
      structuredClone(META_OPENAPI_DOCUMENT),
    );
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('is exported verbatim as META_OPENAPI_DOCUMENT, also from the package entry', () => {
    expect(META_OPENAPI_DOCUMENT).toEqual(
      JSON.parse(readFileSync(OPENAPI_FILE, 'utf8')),
    );
    expect(root.META_OPENAPI_DOCUMENT).toBe(META_OPENAPI_DOCUMENT);
  });

  it('carries the meta-core version and title', () => {
    expect(doc.info).toMatchObject({
      title: 'jeeves-meta',
      version: pkg.version,
    });
  });

  it('has one operation per catalog entry, at its method and path', () => {
    const toOpenApiPath = (path: string) =>
      path.replace(/:(\w+)/g, (_m, name: string) => `{${name}}`);
    expect(
      operations.map((op) => [op.operationId, op.method, op.path]).sort(),
    ).toEqual(
      META_CATALOG.entries
        .map((e) => [e.name, e.method.toLowerCase(), toOpenApiPath(e.path)])
        .sort(),
    );
  });

  it('requires no credentials on any operation', () => {
    for (const op of operations) expect(op.security ?? []).toEqual([]);
  });
});

describe('package.json', () => {
  it('publishes openapi.json as a sub-path export', () => {
    expect(pkg.files).toContain('openapi.json');
    expect(pkg.exports['./openapi.json']).toBe('./openapi.json');
  });

  it('regenerates openapi.json after each release bump, then rebuilds', () => {
    expect(pkg.scripts.openapi).toBe('tsx scripts/write-openapi.ts');
    const hooks = pkg['release-it'].hooks['after:bump'];
    // dist inlines the document, so it must be rebuilt after regeneration
    // or the published META_OPENAPI_DOCUMENT carries the old version.
    expect(hooks.indexOf('npm run openapi')).toBeGreaterThanOrEqual(0);
    expect(hooks.indexOf('npm run build')).toBeGreaterThan(
      hooks.indexOf('npm run openapi'),
    );
    expect(hooks).toContain('git add openapi.json');
  });

  it('keeps meta-core free of Fastify and zod-openapi at runtime', () => {
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('fastify');
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('zod-openapi');
  });
});
