/**
 * Tests for POST /seed route.
 *
 * @module routes/seed.test
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDeps } from './__testUtils.js';
import { registerSeedRoute } from './seed.js';

const testRoot = join(tmpdir(), `jeeves-meta-seed-${Date.now().toString()}`);

describe('POST /seed', () => {
  let app: FastifyInstance;
  let ownerDir: string;

  beforeEach(async () => {
    app = Fastify();
    registerSeedRoute(app, makeTestDeps({ config: { depthWeight: 1 } }));
    await app.ready();
    ownerDir = join(testRoot, `owner-${Date.now().toString()}`);
  });

  afterEach(async () => {
    await app.close();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('creates meta.json with _id when no crossRefs provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/seed',
      payload: { path: ownerDir },
    });

    expect(res.statusCode).toBe(201);
    const metaJsonPath = join(ownerDir, '.meta', 'meta.json');
    expect(existsSync(metaJsonPath)).toBe(true);
    const meta = JSON.parse(readFileSync(metaJsonPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta).toHaveProperty('_id');
    expect(meta).not.toHaveProperty('_crossRefs');
  });

  it('writes _crossRefs to meta.json when crossRefs provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/seed',
      payload: { path: ownerDir, crossRefs: ['j:/path/a', 'j:/path/b'] },
    });

    expect(res.statusCode).toBe(201);
    const metaJsonPath = join(ownerDir, '.meta', 'meta.json');
    const meta = JSON.parse(readFileSync(metaJsonPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta).toHaveProperty('_id');
    expect(meta._crossRefs).toEqual(['j:/path/a', 'j:/path/b']);
  });

  it('writes empty _crossRefs array when crossRefs is []', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/seed',
      payload: { path: ownerDir, crossRefs: [] },
    });

    expect(res.statusCode).toBe(201);
    const metaJsonPath = join(ownerDir, '.meta', 'meta.json');
    const meta = JSON.parse(readFileSync(metaJsonPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta._crossRefs).toEqual([]);
  });

  it('returns 409 when .meta already exists', async () => {
    // Seed once
    await app.inject({
      method: 'POST',
      url: '/seed',
      payload: { path: ownerDir },
    });

    // Seed again — should conflict
    const res = await app.inject({
      method: 'POST',
      url: '/seed',
      payload: { path: ownerDir },
    });
    expect(res.statusCode).toBe(409);
  });
});
