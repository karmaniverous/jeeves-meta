/**
 * Tests for POST /synthesize — enqueue synthesis requests.
 *
 * @module routes/synthesize.test
 */

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { SynthesisQueue } from '../queue/index.js';
import {
  createTestMeta,
  makeFailingTestWatcher,
  makeTestDeps,
  makeTestLogger,
  makeTestWatcher,
} from './__testUtils.js';
import type { RouteDeps } from './index.js';
import { registerSynthesizeRoute } from './synthesize.js';

const synthRoot = join(
  tmpdir(),
  `jeeves-meta-synthesize-${Date.now().toString()}`,
);

describe('POST /synthesize', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    rmSync(synthRoot, { recursive: true, force: true });
  });

  it('enqueues synthesis for a valid path', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    const deps = makeTestDeps({ queue });
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

    expect(body.status).toBe('queued');
    expect(body.path).toBe('/meta/target/.meta');
    expect(body.queuePosition).toBe(0);
    expect(body.alreadyQueued).toBe(false);
    expect(queue.overrides).toHaveLength(1);
  });

  it('normalizes owner path to .meta path', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    const deps = makeTestDeps({ queue });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: { path: '/some/owner/dir' },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json<{ status: string; path: string }>();
    expect(body.status).toBe('queued');
    expect(body.path).toMatch(/[/\\]some[/\\]owner[/\\]dir[/\\]\.meta$/);
    expect(queue.overrides).toHaveLength(1);
  });

  it('preserves path already ending in .meta', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    const deps = makeTestDeps({ queue });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: { path: '/some/owner/dir/.meta' },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json<{ status: string; path: string }>();
    expect(body.status).toBe('queued');
    expect(body.path).toBe('/some/owner/dir/.meta');
    expect(queue.overrides).toHaveLength(1);
  });

  it('returns queue position', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);
    queue.enqueue('/meta/first');
    queue.enqueue('/meta/second');

    const deps = makeTestDeps({ queue });
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
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);

    const deps = makeTestDeps({ queue });
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

    expect(body.status).toBe('queued');
    expect(body.alreadyQueued).toBe(true);
  });

  it('discovers stalest candidate when no path provided', async () => {
    const owner = join(synthRoot, 'stale');
    const metaJsonPath = createTestMeta(owner, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 86400_000).toISOString(),
    });
    const watcher = makeTestWatcher([metaJsonPath]);
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);

    const deps = makeTestDeps({
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

  it('skips disabled metas during auto-select but honors explicit path', async () => {
    const ownerStale = join(synthRoot, 'disabled-stale');
    const metaJsonPath = createTestMeta(ownerStale, {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      _generatedAt: new Date(Date.now() - 86400_000).toISOString(),
      _disabled: true,
    });
    const watcher = makeTestWatcher([metaJsonPath]);
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);

    const deps = makeTestDeps({
      queue,
      watcher: watcher as unknown as RouteDeps['watcher'],
    });
    app = Fastify();
    registerSynthesizeRoute(app, deps);
    await app.ready();

    // Auto-select: disabled meta must be skipped.
    const resAuto = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: {},
    });
    expect(resAuto.statusCode).toBe(200);
    const bodyAuto = resAuto.json<{ status: string }>();
    expect(bodyAuto.status).toBe('skipped');
    expect(queue.depth).toBe(0);

    // Explicit path: manual trigger still works on disabled metas.
    const resExplicit = await app.inject({
      method: 'POST',
      url: '/synthesize',
      payload: { path: ownerStale },
    });
    expect(resExplicit.statusCode).toBe(202);
    const bodyExplicit = resExplicit.json<{ status: string; path: string }>();
    expect(bodyExplicit.status).toBe('queued');
    expect(bodyExplicit.path).toContain('disabled-stale');
    expect(queue.overrides).toHaveLength(1);
  });

  it('returns 503 when watcher unreachable and no path provided', async () => {
    const logger = makeTestLogger();
    const queue = new SynthesisQueue(logger);

    const deps = makeTestDeps({
      queue,
      watcher: makeFailingTestWatcher() as unknown as RouteDeps['watcher'],
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
