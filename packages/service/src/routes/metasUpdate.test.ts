/**
 * Tests for PATCH /metas/:path — update user-settable reserved properties.
 *
 * @module routes/metasUpdate.test
 */

import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { normalizePath } from '../normalizePath.js';
import {
  createTestMeta,
  makeTestDeps,
  makeTestWatcher,
} from './__testUtils.js';
import type { RouteDeps } from './index.js';
import { registerMetasUpdateRoute } from './metasUpdate.js';

const root = join(
  tmpdir(),
  `jeeves-meta-metas-update-${Date.now().toString()}`,
);

function createMeta(
  ownerDir: string,
  meta: Record<string, unknown> = {},
): { metaJsonPath: string; metaDir: string } {
  const metaJsonPath = createTestMeta(ownerDir, meta);
  const metaDir = join(ownerDir, '.meta');
  return { metaJsonPath, metaDir };
}

function readMeta(metaDir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(metaDir, 'meta.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('PATCH /metas/:path', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('updates _disabled: true', async () => {
    const owner = join(root, 'disableMe');
    const { metaJsonPath, metaDir } = createMeta(owner);

    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasUpdateRoute(app, deps);
    await app.ready();

    const encoded = encodeURIComponent(normalizePath(owner));
    const res = await app.inject({
      method: 'PATCH',
      url: `/metas/${encoded}`,
      payload: { _disabled: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ path: string; meta: Record<string, unknown> }>();
    expect(body.meta._disabled).toBe(true);

    // Verify disk
    const disk = readMeta(metaDir);
    expect(disk._disabled).toBe(true);
  });

  it('updates _steer', async () => {
    const owner = join(root, 'steerMe');
    const { metaJsonPath, metaDir } = createMeta(owner);
    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasUpdateRoute(app, deps);
    await app.ready();

    const encoded = encodeURIComponent(normalizePath(owner));
    const res = await app.inject({
      method: 'PATCH',
      url: `/metas/${encoded}`,
      payload: { _steer: 'Focus on API shape' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ meta: Record<string, unknown> }>();
    expect(body.meta._steer).toBe('Focus on API shape');
    expect(readMeta(metaDir)._steer).toBe('Focus on API shape');
  });

  it('removes a property when value is null', async () => {
    const owner = join(root, 'removeSteer');
    const { metaJsonPath, metaDir } = createMeta(owner, {
      _steer: 'old steer',
    });
    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasUpdateRoute(app, deps);
    await app.ready();

    const encoded = encodeURIComponent(normalizePath(owner));
    const res = await app.inject({
      method: 'PATCH',
      url: `/metas/${encoded}`,
      payload: { _steer: null },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ meta: Record<string, unknown> }>();
    expect(body.meta).not.toHaveProperty('_steer');
    expect(readMeta(metaDir)).not.toHaveProperty('_steer');
  });

  it('rejects engine-managed properties (strict validation)', async () => {
    const owner = join(root, 'strict');
    const { metaJsonPath } = createMeta(owner);
    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasUpdateRoute(app, deps);
    await app.ready();

    const encoded = encodeURIComponent(normalizePath(owner));
    const res = await app.inject({
      method: 'PATCH',
      url: `/metas/${encoded}`,
      payload: { _content: 'forbidden' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('BAD_REQUEST');
  });

  it('returns 404 for unknown path', async () => {
    const watcher = makeTestWatcher([]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasUpdateRoute(app, deps);
    await app.ready();

    const encoded = encodeURIComponent('j:/does/not/exist');
    const res = await app.inject({
      method: 'PATCH',
      url: `/metas/${encoded}`,
      payload: { _disabled: true },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('NOT_FOUND');
  });

  it('returns the updated meta, excluding large generated fields', async () => {
    const owner = join(root, 'projection');
    const { metaJsonPath } = createMeta(owner, {
      _architect: 'ARCH PROMPT',
      _builder: 'BUILD PROMPT',
      _critic: 'CRIT PROMPT',
      _content: 'GENERATED CONTENT',
      _feedback: 'FEEDBACK',
      _steer: 'old',
    });
    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasUpdateRoute(app, deps);
    await app.ready();

    const encoded = encodeURIComponent(normalizePath(owner));
    const res = await app.inject({
      method: 'PATCH',
      url: `/metas/${encoded}`,
      payload: { _steer: 'new' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ path: string; meta: Record<string, unknown> }>();
    expect(body.meta._steer).toBe('new');
    expect(body.meta).not.toHaveProperty('_architect');
    expect(body.meta).not.toHaveProperty('_builder');
    expect(body.meta).not.toHaveProperty('_critic');
    expect(body.meta).not.toHaveProperty('_content');
    expect(body.meta).not.toHaveProperty('_feedback');
  });
});
