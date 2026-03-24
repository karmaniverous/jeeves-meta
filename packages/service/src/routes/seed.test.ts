/**
 * Tests for POST /seed route.
 *
 * @module routes/seed.test
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RouteDeps } from './index.js';
import { registerSeedRoute } from './seed.js';

const testRoot = join(tmpdir(), `jeeves-meta-seed-${Date.now().toString()}`);

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

describe('POST /seed', () => {
  let app: FastifyInstance;
  let ownerDir: string;

  beforeEach(async () => {
    app = Fastify();
    registerSeedRoute(app, makeDeps());
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
