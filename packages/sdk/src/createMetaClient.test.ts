/**
 * @module createMetaClient.test
 * The client against a stub fetch: one method per catalog entry, invalid input refused before sending, client and per-call timeouts, the raw error body kept, no retries. End-to-end runs against the real service live in the service package (`sdk-integration.test.ts`).
 */

import { META_CATALOG } from '@karmaniverous/jeeves-meta-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMetaClient } from './createMetaClient.js';
import { MetaError } from './MetaError.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const QUEUED = {
  status: 'queued',
  path: 'j:/a b/.meta',
  owedPhase: 'architect',
  queuePosition: 0,
  alreadyQueued: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createMetaClient', () => {
  it('has one method per catalog entry', () => {
    const client = createMetaClient({
      baseUrl: 'http://x',
      fetch: vi.fn(),
    });
    expect(Object.keys(client).sort()).toEqual(
      META_CATALOG.entries.map((e) => e.name).sort(),
    );
  });

  it('sends the entry request, encoding :path once, and returns the parsed body', async () => {
    const meta = { _id: 'x' };
    const fetchImpl = vi.fn(() =>
      Promise.resolve(json({ path: 'j:/a b/.meta', meta })),
    );
    const client = createMetaClient({
      baseUrl: 'http://x/',
      fetch: fetchImpl,
    });
    await expect(
      client.updateMeta({ path: 'j:/a b/50%', _steer: 'go' }),
    ).resolves.toEqual({ path: 'j:/a b/.meta', meta });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://x/metas/j%3A%2Fa%20b%2F50%25',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('answers 202 synthesize with its body', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json(QUEUED, 202)));
    const client = createMetaClient({ baseUrl: 'http://x', fetch: fetchImpl });
    await expect(client.synthesize({ path: 'j:/a b' })).resolves.toEqual(
      QUEUED,
    );
  });

  it('refuses invalid input without sending anything', async () => {
    const fetchImpl = vi.fn();
    const client = createMetaClient({
      baseUrl: 'http://x',
      fetch: fetchImpl,
    });
    await expect(
      client.updateMeta({ path: 'j:/a', unknownKey: 1 } as never),
    ).rejects.toMatchObject({ code: 'invalid_request', status: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the status, the body's code and message, the body and raw text of an error response, without retrying", async () => {
    const sent = {
      statusCode: 404,
      code: 'META_NOT_FOUND',
      error: 'Not Found',
      message: 'Meta path not found: j:/nope',
    };
    const fetchImpl = vi.fn(() => Promise.resolve(json(sent, 404)));
    const client = createMetaClient({
      baseUrl: 'http://x',
      fetch: fetchImpl,
    });
    const err = await client
      .metaDetail({ path: 'j:/nope' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaError);
    expect(err).toMatchObject({
      status: 404,
      code: 'META_NOT_FOUND',
      message: 'Meta path not found: j:/nope',
      body: sent,
      responseText: JSON.stringify(sent),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('times calls out at 120 s by default', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn(() => Promise.resolve(json({ cleared: 0 })));
    const client = createMetaClient({ baseUrl: 'http://x', fetch: fetchImpl });
    await client.queueClear();
    expect(timeout).toHaveBeenLastCalledWith(120_000);
  });

  it('honours client and per-call timeouts', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchImpl = vi.fn(() => Promise.resolve(json({ cleared: 0 })));
    const client = createMetaClient({
      baseUrl: 'http://x',
      timeoutMs: 5000,
      fetch: fetchImpl,
    });
    await client.queueClear();
    expect(timeout).toHaveBeenLastCalledWith(5000);
    await client.queueClear(undefined, { timeoutMs: 42 });
    expect(timeout).toHaveBeenLastCalledWith(42);
    await expect(
      client.queueClear(undefined, { timeoutMs: 0 }),
    ).rejects.toMatchObject({ code: 'invalid_options' });
  });

  it('serves repeated calls with the same timeout', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(json({ cleared: 2 })));
    const client = createMetaClient({
      baseUrl: 'http://x',
      fetch: fetchImpl,
    });
    await expect(client.queueClear()).resolves.toEqual({ cleared: 2 });
    await expect(client.queueClear()).resolves.toEqual({ cleared: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports a call that outlives its timeout as timeout', async () => {
    const hang = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });
    const client = createMetaClient({ baseUrl: 'http://x', fetch: hang });
    await expect(
      client.queue(undefined, { timeoutMs: 20 }),
    ).rejects.toMatchObject({
      code: 'timeout',
      status: 0,
      message: 'queue timed out after 20 ms',
    });
  });

  it('reports a refused connection as network_error', async () => {
    const refused = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED',
          }),
        }),
      );
    const client = createMetaClient({ baseUrl: 'http://x', fetch: refused });
    await expect(client.status()).rejects.toMatchObject({
      code: 'network_error',
      status: 0,
    });
  });
});
