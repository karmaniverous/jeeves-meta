/**
 * @module routes/queue.test
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SynthesisQueue } from '../queue/index.js';
import { makeTestDeps, makeTestLogger } from './__testUtils.js';
import { registerQueueRoutes } from './queue.js';

describe('queue routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('GET /queue returns current, pending, and automatic', async () => {
    const queue = new SynthesisQueue(makeTestLogger());
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');

    app = Fastify();
    registerQueueRoutes(app, makeTestDeps({ queue }));
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/queue' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      current: unknown;
      pending: unknown[];
      automatic: unknown[];
    }>();
    expect(body.current).toBeNull();
    expect(body.pending).toHaveLength(2);
  });

  it('POST /queue/clear removes pending entries', async () => {
    const queue = new SynthesisQueue(makeTestLogger());
    queue.enqueue('/meta/a');
    queue.enqueue('/meta/b');

    app = Fastify();
    registerQueueRoutes(app, makeTestDeps({ queue }));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/queue/clear' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cleared: 2 });
    expect(queue.items).toHaveLength(0);
  });

  it('POST /synthesize/abort returns idle when nothing running', async () => {
    app = Fastify();
    registerQueueRoutes(app, makeTestDeps());
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
      join(metaDir, 'meta.json'),
      JSON.stringify({
        _phaseState: {
          architect: 'fresh',
          builder: 'running',
          critic: 'stale',
        },
      }),
    );
    writeFileSync(
      join(metaDir, '.lock'),
      JSON.stringify({ _lockPid: process.pid, _lockStartedAt: new Date() }),
    );

    const queue = new SynthesisQueue(makeTestLogger());
    queue.setCurrentPhase(ownerDir, 'builder');
    const abort = vi.fn();

    app = Fastify();
    registerQueueRoutes(app, makeTestDeps({ queue, executor: { abort } }));
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/synthesize/abort' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; path: string; phase: string }>();
    expect(body.status).toBe('aborted');
    expect(body.path).toBe(ownerDir);
    expect(body.phase).toBe('builder');
    expect(abort).toHaveBeenCalledTimes(1);
    expect(existsSync(join(metaDir, '.lock'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
