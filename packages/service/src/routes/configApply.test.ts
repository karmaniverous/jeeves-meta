/**
 * @module routes/configApply.test
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockHandler = vi.fn();
const createConfigApplyHandler = vi.fn(() => mockHandler);

vi.mock('@karmaniverous/jeeves', async (importOriginal) => {
  const actual: unknown = await importOriginal();
  const actualObj: Record<string, unknown> =
    typeof actual === 'object' && actual !== null
      ? (actual as Record<string, unknown>)
      : {};

  return {
    ...actualObj,
    createConfigApplyHandler,
  };
});

describe('POST /config/apply', () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    mockHandler.mockReset();
    createConfigApplyHandler.mockClear();

    const { registerConfigApplyRoute } = await import('./configApply.js');
    app = Fastify();
    registerConfigApplyRoute(app);
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('passes the request body to the SDK handler', async () => {
    mockHandler.mockResolvedValueOnce({
      status: 200,
      body: { status: 'ok' },
    });

    const body = { patch: { schedule: '*/5 * * * *' }, replace: false };
    const res = await app!.inject({
      method: 'POST',
      url: '/config/apply',
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(mockHandler).toHaveBeenCalledWith(body);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('forwards SDK status codes and error bodies', async () => {
    mockHandler.mockResolvedValueOnce({
      status: 400,
      body: { error: 'BAD_REQUEST', message: 'invalid config patch' },
    });

    const res = await app!.inject({
      method: 'POST',
      url: '/config/apply',
      payload: { patch: { port: 'bad' } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'BAD_REQUEST',
      message: 'invalid config patch',
    });
  });
});
