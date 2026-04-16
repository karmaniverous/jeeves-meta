/**
 * Tests for GET /metas routes.
 *
 * - GET /metas — list with filters and projection.
 * - GET /metas/:path — crossRefs status in detail response.
 *
 * @module routes/metas.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';
import type { RouteDeps } from './index.js';
import { registerMetasRoutes } from './metas.js';

const testRoot = join(tmpdir(), `jeeves-meta-metas-${Date.now().toString()}`);

function makeDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    config: {
      watcherUrl: 'http://localhost:3456',
      gatewayUrl: 'http://127.0.0.1:18789',
      depthWeight: 1,
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

function makeWatcher(
  metaJsonPaths: string[],
  scan = vi.fn().mockResolvedValue({ points: [], cursor: null }),
): WatcherClient {
  return {
    walk: vi.fn().mockResolvedValue(metaJsonPaths),
    registerRules: vi.fn().mockResolvedValue(undefined),
    scan,
  };
}

describe('GET /metas — list with filters', () => {
  let app: FastifyInstance;
  const listRoot = join(
    tmpdir(),
    `jeeves-meta-metas-list-${Date.now().toString()}`,
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

  afterEach(async () => {
    await app.close();
    rmSync(listRoot, { recursive: true, force: true });
  });

  it('returns summary + metas array', async () => {
    const ownerA = join(listRoot, 'projA');
    const pathA = createMeta(ownerA, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: '2026-03-01T00:00:00Z',
    });
    const watcher = makeWatcher([pathA]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/metas' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      summary: Record<string, unknown>;
      metas: unknown[];
    }>();

    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('metas');
    expect(body.summary).toHaveProperty('total');
    expect(body.metas).toHaveLength(1);
  });

  it('pathPrefix filter works', async () => {
    const ownerA = join(listRoot, 'alpha', 'projA');
    const ownerB = join(listRoot, 'beta', 'projB');
    const pathA = createMeta(ownerA, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: '2026-03-01T00:00:00Z',
    });
    const pathB = createMeta(ownerB, {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      _generatedAt: '2026-03-01T00:00:00Z',
    });
    const watcher = makeWatcher([pathA, pathB]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/metas?pathPrefix=alpha',
    });
    const body = res.json<{
      summary: { total: number };
      metas: Array<{ path: string }>;
    }>();

    expect(body.summary.total).toBe(1);
    expect(body.metas).toHaveLength(1);
    expect(body.metas[0]?.path).toContain('alpha');
  });

  it('hasError filter works', async () => {
    const ownerOk = join(listRoot, 'ok');
    const ownerErr = join(listRoot, 'err');
    const pathOk = createMeta(ownerOk, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: '2026-03-01T00:00:00Z',
    });
    const pathErr = createMeta(ownerErr, {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      _generatedAt: '2026-03-01T00:00:00Z',
      _error: {
        step: 'builder',
        message: 'timeout',
        timestamp: '2026-03-01T00:00:00Z',
      },
    });
    const watcher = makeWatcher([pathOk, pathErr]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/metas?hasError=true',
    });
    const body = res.json<{
      summary: { total: number };
      metas: Array<{ hasError: boolean }>;
    }>();

    expect(body.metas).toHaveLength(1);
    expect(body.metas[0]?.hasError).toBe(true);
  });

  it('staleHours filter works', async () => {
    const ownerRecent = join(listRoot, 'recent');
    const ownerOld = join(listRoot, 'old');
    const pathRecent = createMeta(ownerRecent, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 1800_000).toISOString(), // 30 min ago
    });
    const pathOld = createMeta(ownerOld, {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      _generatedAt: new Date(Date.now() - 86400_000 * 3).toISOString(), // 3 days ago
    });
    const watcher = makeWatcher([pathRecent, pathOld]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/metas?staleHours=24',
    });
    const body = res.json<{
      summary: { total: number };
      metas: Array<{ path: string }>;
    }>();

    expect(body.metas).toHaveLength(1);
    expect(body.metas[0]?.path).toContain('old');
  });

  it('neverSynthesized=true returns only never-synthesized entries', async () => {
    const ownerSynth = join(listRoot, 'synth');
    const ownerFresh = join(listRoot, 'fresh');
    const pathSynth = createMeta(ownerSynth, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: '2026-03-01T00:00:00Z',
    });
    const pathFresh = createMeta(ownerFresh, {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    });
    const watcher = makeWatcher([pathSynth, pathFresh]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    // neverSynthesized=true: only entries with lastSynthesized === null
    const resTrue = await app.inject({
      method: 'GET',
      url: '/metas?neverSynthesized=true',
    });
    const bodyTrue = resTrue.json<{
      summary: { total: number };
      metas: Array<{ lastSynthesized: string | null }>;
    }>();
    expect(bodyTrue.metas).toHaveLength(1);
    expect(bodyTrue.metas[0]?.lastSynthesized).toBeNull();

    // neverSynthesized=false: only entries with lastSynthesized !== null
    const resFalse = await app.inject({
      method: 'GET',
      url: '/metas?neverSynthesized=false',
    });
    const bodyFalse = resFalse.json<{
      summary: { total: number };
      metas: Array<{ lastSynthesized: string | null }>;
    }>();
    expect(bodyFalse.metas).toHaveLength(1);
    expect(bodyFalse.metas[0]?.lastSynthesized).not.toBeNull();
  });

  it('field projection with custom fields query param', async () => {
    const owner = join(listRoot, 'proj');
    const path = createMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: '2026-03-01T00:00:00Z',
      _architectTokens: 100,
    });
    const watcher = makeWatcher([path]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/metas?fields=path,hasError',
    });
    const body = res.json<{ metas: Array<Record<string, unknown>> }>();

    expect(body.metas).toHaveLength(1);
    const meta = body.metas[0];
    expect(Object.keys(meta)).toEqual(['path', 'hasError']);
  });

  it('default field projection matches expected keys', async () => {
    const owner = join(listRoot, 'defaults');
    const path = createMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: '2026-03-01T00:00:00Z',
    });
    const watcher = makeWatcher([path]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/metas' });
    const body = res.json<{ metas: Array<Record<string, unknown>> }>();

    const expectedKeys = [
      'path',
      'depth',
      'emphasis',
      'stalenessSeconds',
      'lastSynthesized',
      'hasError',
      'locked',
      'disabled',
      'architectTokens',
      'builderTokens',
      'criticTokens',
    ];
    expect(Object.keys(body.metas[0]).sort()).toEqual(expectedKeys.sort());
  });

  it('disabled filter works (true and false)', async () => {
    const ownerActive = join(listRoot, 'active');
    const ownerDisabled = join(listRoot, 'disabled-owner');
    const pathActive = createMeta(ownerActive, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: '2026-03-01T00:00:00Z',
    });
    const pathDisabled = createMeta(ownerDisabled, {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      _generatedAt: '2026-03-01T00:00:00Z',
      _disabled: true,
    });
    const watcher = makeWatcher([pathActive, pathDisabled]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();

    const resTrue = await app.inject({
      method: 'GET',
      url: '/metas?disabled=true',
    });
    const bodyTrue = resTrue.json<{
      metas: Array<{ disabled: boolean; path: string }>;
    }>();
    expect(bodyTrue.metas).toHaveLength(1);
    expect(bodyTrue.metas[0]?.disabled).toBe(true);
    expect(bodyTrue.metas[0]?.path).toContain('disabled-owner');

    const resFalse = await app.inject({
      method: 'GET',
      url: '/metas?disabled=false',
    });
    const bodyFalse = resFalse.json<{
      metas: Array<{ disabled: boolean; path: string }>;
    }>();
    expect(bodyFalse.metas).toHaveLength(1);
    expect(bodyFalse.metas[0]?.disabled).toBe(false);
    expect(bodyFalse.metas[0]?.path).toContain('active');
  });
});

describe('GET /metas/:path — crossRefs status', () => {
  let app: FastifyInstance;
  let ownerDir: string;
  let metaDir: string;
  let refDirA: string;
  let refDirB: string;

  beforeEach(async () => {
    ownerDir = join(testRoot, `owner-${Date.now().toString()}`);
    metaDir = join(ownerDir, '.meta');
    refDirA = join(testRoot, 'refA');
    refDirB = join(testRoot, 'refB');

    // Create owner meta
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      join(metaDir, 'meta.json'),
      JSON.stringify({
        _id: '550e8400-e29b-41d4-a716-446655440001',
        _generatedAt: '2026-03-08T07:00:00Z',
        _crossRefs: [refDirA, refDirB],
      }),
    );

    // Create refA meta with _content
    mkdirSync(join(refDirA, '.meta'), { recursive: true });
    writeFileSync(
      join(refDirA, '.meta', 'meta.json'),
      JSON.stringify({
        _id: '550e8400-e29b-41d4-a716-446655440002',
        _content: 'Ref A synthesis',
      }),
    );

    // refDirB has no .meta directory (missing)
    const watcher = makeWatcher([join(metaDir, 'meta.json')]);
    const deps = makeDeps({
      watcher: watcher as unknown as RouteDeps['watcher'],
    });

    app = Fastify();
    registerMetasRoutes(app, deps);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('includes crossRefs status array in detail response', async () => {
    const encoded = encodeURIComponent(normalizePath(ownerDir));
    const res = await app.inject({
      method: 'GET',
      url: `/metas/${encoded}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      crossRefs: Array<{
        path: string;
        status: string;
        hasContent?: boolean;
      }>;
    }>();

    expect(Array.isArray(body.crossRefs)).toBe(true);
    expect(body.crossRefs).toHaveLength(2);

    const refA = body.crossRefs.find((r) => r.path === refDirA);
    expect(refA).toBeDefined();
    expect(refA?.status).toBe('resolved');
    expect(refA?.hasContent).toBe(true);

    const refB = body.crossRefs.find((r) => r.path === refDirB);
    expect(refB).toBeDefined();
    expect(refB?.status).toBe('missing');
  });

  it('does not include crossRefs key when _crossRefs is absent', async () => {
    // Overwrite meta.json without _crossRefs
    writeFileSync(
      join(metaDir, 'meta.json'),
      JSON.stringify({
        _id: '550e8400-e29b-41d4-a716-446655440001',
        _generatedAt: '2026-03-08T07:00:00Z',
      }),
    );

    const encoded = encodeURIComponent(normalizePath(ownerDir));
    const res = await app.inject({
      method: 'GET',
      url: `/metas/${encoded}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body).not.toHaveProperty('crossRefs');
  });
});

describe('GET /metas/:path — archive reads', () => {
  let app: FastifyInstance;
  let ownerDir: string;
  let metaDir: string;
  const root = join(
    tmpdir(),
    `jeeves-meta-metas-archive-${Date.now().toString()}`,
  );

  beforeEach(() => {
    ownerDir = join(root, `owner-${Date.now().toString()}`);
    metaDir = join(ownerDir, '.meta');
    mkdirSync(join(metaDir, 'archive'), { recursive: true });
    writeFileSync(
      join(metaDir, 'meta.json'),
      JSON.stringify({
        _id: '550e8400-e29b-41d4-a716-446655440010',
        _generatedAt: '2026-03-08T07:00:00Z',
      }),
    );
    writeFileSync(
      join(metaDir, 'archive', '2026-03-08T07-00-00.000Z.json'),
      JSON.stringify({ _id: 'a', archived: 'disk-a' }),
    );
    writeFileSync(
      join(metaDir, 'archive', '2026-03-09T07-00-00.000Z.json'),
      JSON.stringify({ _id: 'b', archived: 'disk-b' }),
    );
  });

  afterEach(async () => {
    await app.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('prefers watcher scan for archive history', async () => {
    const scan = vi.fn().mockResolvedValue({
      points: [
        {
          payload: {
            file_path: `${normalizePath(metaDir)}/archive/2026-03-08T07-00-00.000Z.json`,
            _id: 'a',
            archived: 'watcher-a',
          },
        },
        {
          payload: {
            file_path: `${normalizePath(metaDir)}/archive/2026-03-09T07-00-00.000Z.json`,
            _id: 'b',
            archived: 'watcher-b',
          },
        },
      ],
      cursor: null,
    });

    const watcher = makeWatcher([join(metaDir, 'meta.json')], scan);
    app = Fastify();
    registerMetasRoutes(
      app,
      makeDeps({ watcher: watcher as unknown as RouteDeps['watcher'] }),
    );
    await app.ready();

    const encoded = encodeURIComponent(normalizePath(ownerDir));
    const res = await app.inject({
      method: 'GET',
      url: `/metas/${encoded}?includeArchive=true`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ archive: Array<{ archived: string }> }>();
    expect(scan).toHaveBeenCalledTimes(1);
    expect(body.archive.map((entry) => entry.archived)).toEqual([
      'watcher-b',
      'watcher-a',
    ]);
  });

  it('falls back to disk reads when watcher scan fails', async () => {
    const watcher = makeWatcher(
      [join(metaDir, 'meta.json')],
      vi.fn().mockRejectedValue(new Error('watcher down')),
    );
    app = Fastify();
    registerMetasRoutes(
      app,
      makeDeps({ watcher: watcher as unknown as RouteDeps['watcher'] }),
    );
    await app.ready();

    const encoded = encodeURIComponent(normalizePath(ownerDir));
    const res = await app.inject({
      method: 'GET',
      url: `/metas/${encoded}?includeArchive=1`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ archive: Array<{ archived: string }> }>();
    expect(body.archive.map((entry) => entry.archived)).toEqual(['disk-b']);
  });
});
