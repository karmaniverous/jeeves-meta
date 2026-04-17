/**
 * @module routes/queue.test
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SynthesisQueue } from '../queue/index.js';
import type { RouteDeps } from './index.js';
import { registerQueueRoutes } from './queue.js';

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
    executor: { abort: vi.fn() } as RouteDeps['executor'],
    ...overrides,
  };
}

describe('queue routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('GET /queue returns current, pending, and state', async () => {
    const queue = new SynthesisQueue(makeLogger());
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');

    app = Fastify();
    registerQueueRoutes(app, makeDeps({ queue }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/queue' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      current: unknown;
      pending: unknown[];
      state: { depth: number; items: unknown[] };
    }>();
    expect(body.current).toBeNull();
    expect(body.pending).toHaveLength(2);
    expect(body.state.depth).toBe(2);
    expect(body.state.items).toHaveLength(2);
  });

  it('POST /queue/clear removes override entries only', async () => {
    const queue = new SynthesisQueue(makeLogger());
    queue.enqueue('/meta/current');
    queue.dequeue();
    queue.enqueueOverride('/meta/override-a');
    queue.enqueueOverride('/meta/override-b');

    app = Fastify();
    registerQueueRoutes(app, makeDeps({ queue }));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/queue/clear' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cleared: 2 });
    expect(queue.current?.path).toBe('/meta/current');
    expect(queue.overrides).toHaveLength(0);
  });

  it('POST /synthesize/abort returns idle when nothing running', async () => {
    app = Fastify();
    registerQueueRoutes(app, makeDeps());
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/synthesize/abort' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'idle' });
  });

  it('POST /synthesize/abort aborts the executor and releases the lock', async () => {
    const root = join(tmpdir(), `jeeves-meta-queue-${Date.now().toString()}`);
    const ownerDir = join(root, 'owner');
    const metaDir = join(ownerDir, '.meta');
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      join(metaDir, '.lock'),
      JSON.stringify({ _lockPid: process.pid, _lockStartedAt: new Date() }),
    );

    const queue = new SynthesisQueue(makeLogger());
    queue.enqueue(ownerDir);
    queue.dequeue();
    const abort = vi.fn();

    app = Fastify();
    registerQueueRoutes(
      app,
      makeDeps({ queue, executor: { abort } as RouteDeps['executor'] }),
    );
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/synthesize/abort' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'aborted', path: ownerDir });
    expect(abort).toHaveBeenCalledTimes(1);
    expect(existsSync(join(metaDir, '.lock'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
