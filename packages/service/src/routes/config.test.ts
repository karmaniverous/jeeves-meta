/**
 * @module routes/config.test
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDeps } from './__testUtils.js';
import { registerConfigRoute } from './config.js';

describe('GET /config', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    registerConfigRoute(
      app,
      makeTestDeps({ config: { gatewayApiKey: 'secret-key' } }),
    );
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
