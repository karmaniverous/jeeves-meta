/**
 * Tests for GET /status — service health and status overview.
 *
 * @module routes/status.test
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { SynthesisQueue } from '../queue/index.js';
import type { RouteDeps } from './index.js';
import { makeTestDeps, makeTestLogger } from './__testUtils.js';
import { registerStatusRoute } from './status.js';

/** Custom stats used by status tests. */
const TEST_STATS: RouteDeps['stats'] = {
  totalSyntheses: 5,
  totalTokens: 12000,
  totalErrors: 1,
  lastCycleDurationMs: 45000,
  lastCycleAt: '2026-03-24T08:00:00Z',
};

interface StatusResponse {
  name: string;
  version: string;
  uptime: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  health: {
    serviceState: 'idle' | 'synthesizing' | 'waiting' | 'stopping';
    currentTarget: string | null;
    queue: { depth: number; items: unknown[] };
    stats: {
      totalSyntheses: number;
      totalTokens: number;
      totalErrors: number;
      lastCycleDurationMs: number | null;
      lastCycleAt: string | null;
    };
    schedule: {
      expression: string;
      nextAt: string | null;
    };
    dependencies: Record<string, unknown>;
  };
}

describe('GET /status', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('returns service name, version, uptime', async () => {
    const deps = makeTestDeps({
      queue: new SynthesisQueue(makeTestLogger()),
      stats: TEST_STATS,
    });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json<StatusResponse>();

    expect(body.name).toBe('jeeves-meta');
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('returns SDK status and nested dependency health', async () => {
    const deps = makeTestDeps({
      queue: new SynthesisQueue(makeTestLogger()),
      stats: TEST_STATS,
    });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();

    expect(body.status).toBe('healthy');
    expect(body.health.dependencies).toHaveProperty('watcher');
    expect(body.health.dependencies).toHaveProperty('gateway');
  });

  it('includes queue state', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b', true);

    const deps = makeTestDeps({ queue, stats: TEST_STATS });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();

    expect(body.health.queue).toBeDefined();
    expect(body.health.queue.depth).toBe(2);
    expect(body.health.queue.items).toHaveLength(2);
  });

  it('includes stats (totalSyntheses, totalTokens, etc.)', async () => {
    const deps = makeTestDeps({
      queue: new SynthesisQueue(makeTestLogger()),
      stats: TEST_STATS,
    });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();

    expect(body.health.stats.totalSyntheses).toBe(5);
    expect(body.health.stats.totalTokens).toBe(12000);
    expect(body.health.stats.totalErrors).toBe(1);
    expect(body.health.stats.lastCycleDurationMs).toBe(45000);
    expect(body.health.stats.lastCycleAt).toBe('2026-03-24T08:00:00Z');
  });

  it('includes schedule info (expression, nextAt)', async () => {
    const deps = makeTestDeps({
      queue: new SynthesisQueue(makeTestLogger()),
      stats: TEST_STATS,
    });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();

    expect(body.health.schedule.expression).toBe('*/30 * * * *');
    expect(body.health.schedule.nextAt).toBeNull();
  });

  it('shows currentTarget in nested health when synthesis is active', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    queue.enqueue('/meta/active');
    queue.dequeue();

    const deps = makeTestDeps({ queue, stats: TEST_STATS });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();

    expect(body.status).toBe('healthy');
    expect(body.health.currentTarget).toBe('/meta/active');
  });

  it('returns serviceState "idle" when nothing is happening', async () => {
    const deps = makeTestDeps({
      queue: new SynthesisQueue(makeTestLogger()),
      stats: TEST_STATS,
    });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();
    expect(body.health.serviceState).toBe('idle');
  });

  it('returns serviceState "synthesizing" when a synthesis is in progress', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    queue.enqueue('/meta/active');
    queue.dequeue();

    const deps = makeTestDeps({ queue, stats: TEST_STATS });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();
    expect(body.health.serviceState).toBe('synthesizing');
  });

  it('returns serviceState "waiting" when queue has items but none processing', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    queue.enqueue('/meta/pending');

    const deps = makeTestDeps({ queue, stats: TEST_STATS });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();
    expect(body.health.serviceState).toBe('waiting');
  });

  it('returns serviceState "stopping" during shutdown', async () => {
    const deps = makeTestDeps({
      queue: new SynthesisQueue(makeTestLogger()),
      shuttingDown: true,
      stats: TEST_STATS,
    });
    app = Fastify();
    registerStatusRoute(app, deps);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/status' });
    const body = res.json<StatusResponse>();
    expect(body.health.serviceState).toBe('stopping');
  });
});
