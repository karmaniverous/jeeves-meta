/**
 * Tests for POST /synthesize — enqueue synthesis requests.
 *
 * @module routes/synthesize.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import { SynthesisQueue } from '../queue/index.js';
import type { RouteDeps } from './index.js';
import { registerSynthesizeRoute } from './synthesize.js';

const synthRoot = join(
  tmpdir(),
  `jeeves-meta-synthesize-${Date.now().toString()}`,
);

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
  } as unknown as Logger;
}

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
      schedule: '*/30 * * * *',
      watcherHealthIntervalMs: 60000,
      logging: { level: 'info' },
      autoSeed: [],
    },
    logger: makeLogger(),
    queue: new SynthesisQueue(makeLogger()),
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

describe('POST /synthesize', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    rmSync(synthRoot, { recursive: true, force: true });
  });

  it('enqueues synthesis for a valid path', async () => {
    const logger = makeLogger();
    const queue = new SynthesisQueue(logger);
    const deps = makeDeps({ queue });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: { path: '/meta/target/.meta' },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json<{
      status: string;
      path: string;
      queuePosition: number;
      alreadyQueued: boolean;
    }>();

    expect(body.status).toBe('accepted');
    expect(body.path).toBe('/meta/target/.meta');
    expect(body.queuePosition).toBe(0);
    expect(body.alreadyQueued).toBe(false);
    expect(queue.depth).toBe(1);
  });

  it('returns queue position', async () => {
    const logger = makeLogger();
    const queue = new SynthesisQueue(logger);
    queue.enqueue('/meta/first');
    queue.enqueue('/meta/second');

    const deps = makeDeps({ queue });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: { path: '/meta/third' },
    });

    const body = res.json<{ queuePosition: number }>();
    // /meta/third is 3rd item — position 0 is front of queue
    // With priority=true (path provided), it goes to front
    expect(body.queuePosition).toBe(0);
  });

  it('returns already-queued status for duplicate path', async () => {
    const logger = makeLogger();
    const queue = new SynthesisQueue(logger);

    const deps = makeDeps({ queue });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    // First request
    await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: { path: '/meta/dup' },
    });

    // Second request with same path
    const res = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: { path: '/meta/dup' },
    });

    const body = res.json<{
      status: string;
      alreadyQueued: boolean;
    }>();

    expect(body.status).toBe('accepted');
    expect(body.alreadyQueued).toBe(true);
  });

  it('discovers stalest candidate when no path provided', async () => {
    const owner = join(synthRoot, 'stale');
    const metaJsonPath = createMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 86400_000).toISOString(),
    });
    const watcher = makeWatcher([metaJsonPath]);
    const logger = makeLogger();
    const queue = new SynthesisQueue(logger);

    const deps = makeDeps({
      queue,
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: {},
    });

    expect(res.statusCode).toBe(202);
    const body = res.json<{ status: string; path: string }>();
    expect(body.status).toBe('accepted');
    expect(body.path).toContain('stale');
  });

  it('returns 503 when watcher unreachable and no path provided', async () => {
    const watcher: WatcherClient = {
      walk: vi.fn().mockRejectedValue(new Error('connection refused')),
      registerRules: vi.fn().mockResolvedValue(undefined),
    };
    const logger = makeLogger();
    const queue = new SynthesisQueue(logger);

    const deps = makeDeps({
      queue,
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: {},
    });

    expect(res.statusCode).toBe(503);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });
});
