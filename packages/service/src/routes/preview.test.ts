/**
 * Tests for GET /preview — dry-run synthesis preview.
 *
 * @module routes/preview.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import type { RouteDeps } from './index.js';
import { registerPreviewRoute } from './preview.js';

function makeDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    config: {
      watcherUrl: 'http://localhost:3456',
      gatewayUrl: 'http://127.0.0.1:18789',
      depthWeight: 0.5,
      architectEvery: 10,
      maxArchive: 20,
      maxLines: 500,
      architectTimeout: 120,
      builderTimeout: 600,
      criticTimeout: 300,
      thinking: 'low',
      defaultArchitect: 'arch',
      defaultCritic: 'crit',
      skipUnchanged: true,
      metaProperty: {},
      metaArchiveProperty: {},
      port: 1938,
      host: '127.0.0.1',
      schedule: '*/30 * * * *',
      watcherHealthIntervalMs: 60000,
      logging: { level: 'info' },
      autoSeed: [],
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger,
    queue: {} as RouteDeps['queue'],
    watcher: {} as RouteDeps['watcher'],
    scheduler: null,
    stats: {
      totalSyntheses: 0,
      totalTokens: 0,
      totalErrors: 0,
      lastCycleDurationMs: null,
      lastCycleAt: null,
    },
    ...overrides,
  };
}

function makeWatcher(metaJsonPaths: string[]): WatcherClient {
  return {
    walk: vi.fn().mockResolvedValue(metaJsonPaths),
    registerRules: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFailingWatcher(): WatcherClient {
  return {
    walk: vi.fn().mockRejectedValue(new Error('connection refused')),
    registerRules: vi.fn().mockResolvedValue(undefined),
  };
}

const previewRoot = join(
  tmpdir(),
  `jeeves-meta-preview-${Date.now().toString()}`,
);

function createMeta(
  ownerDir: string,
  meta: Record<string, unknown> = {},
): string {
  const metaDir = join(ownerDir, '.meta');
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(
    join(metaDir, 'meta.json'),
    JSON.stringify({
      _id: '550e8400-e29b-41d4-a716-446655440099',
      ...meta,
    }),
  );
  return join(metaDir, 'meta.json');
}

describe('GET /preview', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    rmSync(previewRoot, { recursive: true, force: true });
  });

  it('returns preview for stalest candidate when no path query', async () => {
    const ownerA = join(previewRoot, 'old');
    const ownerB = join(previewRoot, 'recent');
    const pathA = createMeta(ownerA, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 86400_000 * 7).toISOString(),
    });
    const pathB = createMeta(ownerB, {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    const watcher = makeWatcher([pathA, pathB]);
    const deps = makeDeps({
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
    const metaJsonPath = createMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    const watcher = makeWatcher([metaJsonPath]);
    const deps = makeDeps({
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
    const watcher = makeFailingWatcher();
    const deps = makeDeps({
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
    const metaJsonPath = createMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 86400_000).toISOString(),
      _builder: 'cached builder prompt',
      _architectTokens: 100,
      _builderTokens: 200,
      _criticTokens: 50,
    });
    const watcher = makeWatcher([metaJsonPath]);
    const deps = makeDeps({
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
    const metaJsonPath = createMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
      // No _builder field — first run
    });
    const watcher = makeWatcher([metaJsonPath]);
    const deps = makeDeps({
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
