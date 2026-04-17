/**
 * Operator-surface integration tests for phase-state additive contracts.
 *
 * Verifies that GET /status, GET /queue, and GET /metas include the
 * phase-state fields specified in spec §8 "Operator surfaces."
 *
 * Task #18: Operator-surface integration tests.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SynthesisQueue } from '../queue/index.js';
import { makeTestDeps, makeTestLogger } from './__testUtils.js';
import { registerQueueRoutes } from './queue.js';
import { registerStatusRoute } from './status.js';

describe('phase-state operator surfaces (Task #18)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /status — phaseStateSummary and nextPhase', () => {
    it('includes phaseStateSummary in health', async () => {
      const deps = makeTestDeps();
      app = Fastify();
      registerStatusRoute(app, deps);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/status' });
      const body = res.json<{
        health: {
          phaseStateSummary: Record<string, Record<string, number>>;
          nextPhase: unknown;
        };
      }>();

      // phaseStateSummary should exist (may be empty if watcher unreachable)
      expect(body.health).toHaveProperty('phaseStateSummary');
      const pss = body.health.phaseStateSummary;
      expect(pss).toHaveProperty('architect');
      expect(pss).toHaveProperty('builder');
      expect(pss).toHaveProperty('critic');

      // Each phase should have counts for all states
      for (const phase of ['architect', 'builder', 'critic']) {
        for (const state of [
          'fresh',
          'stale',
          'pending',
          'running',
          'failed',
        ]) {
          expect(pss[phase]).toHaveProperty(state);
          expect(typeof pss[phase][state]).toBe('number');
        }
      }
    });

    it('includes nextPhase in health (null when no candidates)', async () => {
      const deps = makeTestDeps();
      app = Fastify();
      registerStatusRoute(app, deps);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/status' });
      const body = res.json<{ health: { nextPhase: unknown } }>();

      expect(body.health).toHaveProperty('nextPhase');
      // No watcher = no candidates = null
      expect(body.health.nextPhase).toBeNull();
    });
  });

  describe('GET /queue — 3-layer model', () => {
    it('returns current, overrides, automatic, pending, state', async () => {
      const logger = makeTestLogger();
      const queue = new SynthesisQueue(logger);
      const deps = makeTestDeps({ queue });
      app = Fastify();
      registerQueueRoutes(app, deps);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/queue' });
      const body = res.json<{
        current: unknown;
        overrides: unknown[];
        automatic: unknown[];
        pending: unknown[];
        state: { depth: number; items: unknown[] };
      }>();

      expect(body).toHaveProperty('current');
      expect(body).toHaveProperty('overrides');
      expect(body).toHaveProperty('automatic');
      expect(body).toHaveProperty('pending');
      expect(body).toHaveProperty('state');
    });

    it('current includes phase when phase-aware item is set', async () => {
      const logger = makeTestLogger();
      const queue = new SynthesisQueue(logger);
      queue.setCurrentPhase('/meta/test', 'builder');

      const deps = makeTestDeps({ queue });
      app = Fastify();
      registerQueueRoutes(app, deps);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/queue' });
      const body = res.json<{
        current: { path: string; phase: string; startedAt: string };
      }>();

      expect(body.current).not.toBeNull();
      expect(body.current.path).toBe('/meta/test');
      expect(body.current.phase).toBe('builder');
      expect(body.current.startedAt).toBeDefined();
    });

    it('overrides reflect enqueued override entries', async () => {
      const logger = makeTestLogger();
      const queue = new SynthesisQueue(logger);
      queue.enqueueOverride('/meta/override-a');
      queue.enqueueOverride('/meta/override-b');

      const deps = makeTestDeps({ queue });
      app = Fastify();
      registerQueueRoutes(app, deps);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/queue' });
      const body = res.json<{
        overrides: Array<{
          path: string;
          owedPhase: string | null;
          enqueuedAt: string;
        }>;
      }>();

      expect(body.overrides).toHaveLength(2);
      expect(body.overrides[0].path).toBe('/meta/override-a');
      expect(body.overrides[1].path).toBe('/meta/override-b');
    });

    it('POST /queue/clear removes only overrides', async () => {
      const logger = makeTestLogger();
      const queue = new SynthesisQueue(logger);
      queue.enqueueOverride('/meta/override-a');
      queue.enqueue('/meta/legacy-item');

      const deps = makeTestDeps({ queue });
      app = Fastify();
      registerQueueRoutes(app, deps);
      await app.ready();

      const res = await app.inject({ method: 'POST', url: '/queue/clear' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cleared: 1 });

      // Legacy queue should be unaffected
      expect(queue.depth).toBe(1);
      expect(queue.overrides).toHaveLength(0);
    });
  });

  describe('POST /synthesize/abort — phase-state integration', () => {
    it('returns {status: idle} when nothing is running', async () => {
      const deps = makeTestDeps();
      app = Fastify();
      registerQueueRoutes(app, deps);
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/synthesize/abort',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'idle' });
    });

    it('returns {status: aborted, path, phase} when phase item is running', async () => {
      const logger = makeTestLogger();
      const queue = new SynthesisQueue(logger);
      queue.setCurrentPhase('/meta/active', 'critic');

      const deps = makeTestDeps({ queue, executor: { abort: vi.fn() } });
      app = Fastify();
      registerQueueRoutes(app, deps);
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/synthesize/abort',
      });
      const body = res.json<{
        status: string;
        path: string;
        phase: string;
      }>();

      expect(body.status).toBe('aborted');
      expect(body.path).toBe('/meta/active');
      expect(body.phase).toBe('critic');
    });
  });
});
