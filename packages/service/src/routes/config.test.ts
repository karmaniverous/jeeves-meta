/**
 * @module routes/config.test
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerConfigRoute } from './config.js';
import type { RouteDeps } from './index.js';

function makeDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    config: {
      watcherUrl: 'http://localhost:3456',
      gatewayUrl: 'http://127.0.0.1:18789',
      gatewayApiKey: 'secret-key',
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
    logger: { warn: vi.fn(), error: vi.fn() } as unknown as Logger,
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

describe('GET /config', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerConfigRoute(app, makeDeps());
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns full sanitized config without path param', async () => {
    const res = await app.inject({ method: 'GET', url: '/config' });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body).toHaveProperty('watcherUrl', 'http://localhost:3456');
    expect(body).toHaveProperty('gatewayApiKey', '[REDACTED]');
  });

  it('returns JSONPath query result with path param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/config?path=$.port',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ count: number; result: unknown[] }>();
    expect(body.count).toBe(1);
    expect(body.result).toContain(1938);
  });

  it('redacts gatewayApiKey in sanitized config', async () => {
    const res = await app.inject({ method: 'GET', url: '/config' });
    const body = res.json<Record<string, unknown>>();
    expect(body.gatewayApiKey).toBe('[REDACTED]');
  });

  it('returns 400 for invalid JSONPath expression', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/config?path=$[?(',
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body).toHaveProperty('error');
  });
});
