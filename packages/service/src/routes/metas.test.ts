/**
 * Tests for GET /metas/:path — crossRefs status in detail response.
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
      host: '127.0.0.1',
      schedule: '*/30 * * * *',
      watcherHealthIntervalMs: 60000,
      logging: { level: 'info' },
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
