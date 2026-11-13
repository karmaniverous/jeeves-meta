/**
 * @module endpoints.test
 * The deprecated endpoint list (Decision 183): still exported from the
 * package entry, tagged `@deprecated`, still working, and held equal to
 * `META_CATALOG`. Accessed through namespace casts because direct
 * references fail `no-deprecated`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { META_CATALOG } from './catalog.js';
import * as endpoints from './endpoints.js';
import * as root from './index.js';

interface LegacyEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
}

interface Legacy {
  META_ENDPOINTS: readonly LegacyEndpoint[];
  getEndpoint: (name: string) => LegacyEndpoint;
}

const legacy = endpoints as unknown as Legacy;

describe('META_ENDPOINTS (deprecated)', () => {
  it('mirrors the catalog by name, method, path and description', () => {
    expect(legacy.META_ENDPOINTS).toEqual(
      META_CATALOG.entries.map(({ name, method, path, description }) => ({
        name,
        method,
        path,
        description,
      })),
    );
  });

  it('getEndpoint finds an entry by name and refuses an unknown one', () => {
    expect(legacy.getEndpoint('metaDetail').path).toBe('/metas/:path');
    expect(() => legacy.getEndpoint('nope')).toThrow('Unknown endpoint: nope');
  });

  it('is still exported from the package entry', () => {
    const fromRoot = root as unknown as Legacy;
    expect(fromRoot.META_ENDPOINTS).toBe(legacy.META_ENDPOINTS);
    expect(fromRoot.getEndpoint).toBe(legacy.getEndpoint);
  });

  it('tags every export @deprecated', () => {
    const source = readFileSync(
      new URL('./endpoints.ts', import.meta.url),
      'utf8',
    );
    const exported = [
      ...source.matchAll(/^export (?:type|const|function) (\w+)/gm),
    ].map((m) => m[1]);
    expect(exported.sort()).toEqual(
      [
        'Endpoint',
        'EndpointDescriptor',
        'EndpointName',
        'HttpMethod',
        'META_ENDPOINTS',
        'getEndpoint',
      ].sort(),
    );
    const deprecations = source.match(/@deprecated/g) ?? [];
    expect(deprecations).toHaveLength(exported.length);
  });
});
