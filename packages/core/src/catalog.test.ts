/**
 * Tests for `META_CATALOG` and what derives from it: the 13 entries with
 * their routes, auth and kinds (spec 4.4.1, Decisions 183, 192, 208), the
 * error-code
 * table, and `metaConfigSchema` unchanged (jeeves-tools imports it).
 *
 * @module catalog.test
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { META_CATALOG } from './catalog.js';
import { META_ERROR_CODES, META_ERROR_STATUS } from './errorCodes.js';
import { metaConfigSchema } from './metaConfig.js';

/** name, method, path and kind of every entry, in catalog order. */
const ROUTES = [
  ['status', 'GET', '/status', 'read'],
  ['listMetas', 'GET', '/metas', 'read'],
  ['metaDetail', 'GET', '/metas/:path', 'read'],
  ['updateMeta', 'PATCH', '/metas/:path', 'write'],
  ['synthesize', 'POST', '/synthesize', 'write'],
  ['abort', 'POST', '/synthesize/abort', 'destructive'],
  ['preview', 'GET', '/preview', 'read'],
  ['seed', 'POST', '/seed', 'write'],
  ['unlock', 'POST', '/unlock', 'destructive'],
  ['config', 'GET', '/config', 'read'],
  ['configApply', 'POST', '/config/apply', 'write'],
  ['queue', 'GET', '/queue', 'read'],
  ['queueClear', 'POST', '/queue/clear', 'destructive'],
] as const;

describe('META_CATALOG', () => {
  it('has exactly the 13 entries, routes and kinds of the spec', () => {
    expect(
      META_CATALOG.entries.map((e) => [e.name, e.method, e.path, e.kind]),
    ).toEqual(ROUTES);
  });

  it('needs no auth on any entry (Decision 192)', () => {
    for (const entry of META_CATALOG.entries) expect(entry.auth).toBe('none');
  });

  it('describes every entry', () => {
    for (const entry of META_CATALOG.entries)
      expect(entry.description.length).toBeGreaterThan(10);
  });

  it("answers configApply with meta's response, never the config (203)", () => {
    const entry = META_CATALOG.entries.find((e) => e.name === 'configApply');
    const body = { applied: true, restartRequired: false, config: { k: 1 } };
    expect(entry?.response.parse(body)).toEqual({
      applied: true,
      restartRequired: false,
    });
    expect(() => entry?.response.parse({ applied: true })).toThrow();
  });
});

describe('META_ERROR_CODES', () => {
  it('are unique META_ codes, each with its 4.4.4 status', () => {
    expect(new Set(META_ERROR_CODES).size).toBe(META_ERROR_CODES.length);
    expect(Object.keys(META_ERROR_STATUS).sort()).toEqual(
      [...META_ERROR_CODES].sort(),
    );
    expect(META_ERROR_STATUS).toEqual({
      META_INVALID_JSONPATH: 400,
      META_NOT_FOUND: 404,
      META_ALREADY_EXISTS: 409,
      META_NOT_LOCKED: 409,
      META_CONFIG_UNAVAILABLE: 500,
      META_WATCHER_UNAVAILABLE: 503,
      META_NOT_READY: 503,
    });
  });
});

describe('metaConfigSchema', () => {
  it('is unchanged (jeeves-tools imports it)', () => {
    expect(z.toJSONSchema(metaConfigSchema, { io: 'input' })).toMatchSnapshot();
  });
});
