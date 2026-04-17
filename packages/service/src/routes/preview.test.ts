/**
 * Tests for GET /preview — dry-run synthesis preview.
 *
 * @module routes/preview.test
 */

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createTestMeta,
  makeFailingTestWatcher,
  makeTestDeps,
  makeTestWatcher,
} from './__testUtils.js';
import type { RouteDeps } from './index.js';
import { registerPreviewRoute } from './preview.js';

const previewRoot = join(
  tmpdir(),
  `jeeves-meta-preview-${Date.now().toString()}`,
);

describe('GET /preview', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    rmSync(previewRoot, { recursive: true, force: true });
  });

  it('returns preview for stalest candidate when no path query', async () => {
    const ownerA = join(previewRoot, 'old');
    const ownerB = join(previewRoot, 'recent');
    const pathA = createTestMeta(ownerA, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 86400_000 * 7).toISOString(),
    });
    const pathB = createTestMeta(ownerB, {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    const watcher = makeTestWatcher([pathA, pathB]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerPreviewRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/preview' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ path: string }>();

    expect(body).toHaveProperty('path');
    // Stalest should be the old one
    expect(body.path).toContain('old');
  });

  it('returns preview for specific path when path query provided', async () => {
    const owner = join(previewRoot, 'specific');
    const metaJsonPath = createTestMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerPreviewRoute(app, deps);
    await app.ready();

    const metaDir = join(owner, '.meta');
    const res = await app.inject({
      method: 'GET',
      url: `/preview?path=${encodeURIComponent(metaDir)}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ path: string }>();

    expect(body.path).toContain('specific');
  });

  it('returns 503 when watcher is unreachable', async () => {
    const watcher = makeFailingTestWatcher();
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerPreviewRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/preview' });
    expect(res.statusCode).toBe(503);
    const body = res.json<{ error: string }>();

    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('response includes architectWillRun, scope, staleness, estimatedTokens', async () => {
    const owner = join(previewRoot, 'full');
    const metaJsonPath = createTestMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 86400_000).toISOString(),
      _builder: 'cached builder prompt',
      _architectTokens: 100,
      _builderTokens: 200,
      _criticTokens: 50,
    });
    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerPreviewRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/preview' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      architectWillRun: boolean;
      scope: Record<string, unknown>;
      staleness: Record<string, unknown>;
      estimatedTokens: Record<string, number>;
    }>();

    expect(body).toHaveProperty('architectWillRun');
    expect(body).toHaveProperty('scope');
    expect(body).toHaveProperty('staleness');
    expect(body).toHaveProperty('estimatedTokens');
    expect(body.staleness).toHaveProperty('seconds');
    expect(body.staleness).toHaveProperty('score');
    expect(body.scope).toHaveProperty('ownedFiles');
    expect(body.scope).toHaveProperty('childMetas');
  });

  it('architect is triggered for fresh meta (no _builder)', async () => {
    const owner = join(previewRoot, 'fresh');
    const metaJsonPath = createTestMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
      // No _builder field — first run
    });
    const watcher = makeTestWatcher([metaJsonPath]);
    const deps = makeTestDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerPreviewRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/preview' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      architectWillRun: boolean;
      architectReason: string;
    }>();

    expect(body.architectWillRun).toBe(true);
    expect(body.architectReason).toContain('no cached builder');
  });
});
