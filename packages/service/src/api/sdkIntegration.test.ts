/**
 * @module api/sdkIntegration.test
 * The SDK against the real Fastify app on a loopback port (spec 4.4.5): a
 * round trip through every catalog entry over the wire fixture corpus,
 * `:path` values with spaces, `/`, `:` and `%` decoded exactly once, meta
 * errors arriving as `MetaError` with their status and code, and invalid
 * input refused before anything is sent.
 */

import {
  META_CATALOG,
  type MetaEntryName,
} from '@karmaniverous/jeeves-meta-core';
import {
  createMetaClient,
  type MetaClient,
  MetaError,
} from '@karmaniverous/jeeves-meta-sdk';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startWireApp, type WireApp } from '../test/wire/wireApp.js';
import { FIXTURE_OWNERS } from '../test/wire/wireFixtures.js';

vi.mock('../configHotReload.js', () => ({
  applyHotReloadedConfig: vi.fn(),
  RESTART_REQUIRED_FIELDS: ['port', 'gatewayApiKey'],
}));

let wire: WireApp;
let meta: MetaClient;
const fetchSpy = vi.fn(fetch);
const called = new Set<MetaEntryName>();

beforeAll(async () => {
  wire = await startWireApp();
  wire.reset();
  const address = await wire.app.listen({ host: '127.0.0.1', port: 0 });
  const client = createMetaClient({ baseUrl: address, fetch: fetchSpy });
  // Record which entries the tests call.
  meta = new Proxy(client, {
    get: (target, name: MetaEntryName) => {
      called.add(name);
      return target[name];
    },
  });
});

afterAll(async () => {
  await wire.close();
});

const path = (key: keyof typeof FIXTURE_OWNERS) =>
  wire.ownerPath(FIXTURE_OWNERS[key]);

describe('SDK round trip through every entry', () => {
  it('status, config and configApply', async () => {
    const status = await meta.status();
    expect(status.name).toBe('jeeves-meta');
    expect(status.health).toHaveProperty('serviceState', 'idle');
    await expect(meta.config({ path: '$.port' })).resolves.toEqual({
      result: [1938],
      count: 1,
    });
    await expect(
      meta.configApply({ patch: { thinking: 'medium' } }),
    ).resolves.toEqual({ applied: true, restartRequired: false });
  });

  it('listMetas and metaDetail, including spaces and % in :path', async () => {
    const { summary, metas } = await meta.listMetas({ fields: 'path' });
    expect(summary.total).toBe(metas.length);
    for (const key of ['spaced', 'percent'] as const) {
      const detail = await meta.metaDetail({ path: path(key) });
      expect(detail.path).toBe(`${path(key)}/.meta`);
    }
  });

  it('sends a :path with a space, /, : and % once-encoded and gets it back verbatim', async () => {
    const odd = '/no such/dir:x/50%';
    const err = await meta.metaDetail({ path: odd }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaError);
    expect(err).toMatchObject({
      status: 404,
      code: 'META_NOT_FOUND',
      message: `Meta path not found: ${odd}`,
    });
    const url = fetchSpy.mock.calls.at(-1)?.[0] as string;
    expect(url.endsWith('/metas/%2Fno%20such%2Fdir%3Ax%2F50%25')).toBe(true);
  });

  it('updateMeta, preview, synthesize, queue, abort and queueClear', async () => {
    await expect(
      meta.updateMeta({ path: path('fresh'), _steer: 'sdk' }),
    ).resolves.toMatchObject({ meta: { _steer: 'sdk' } });
    await expect(meta.preview({ path: path('stale') })).resolves.toMatchObject({
      path: `${path('stale')}/.meta`,
    });
    await expect(
      meta.synthesize({ path: path('stale') }),
    ).resolves.toMatchObject({ status: 'queued', alreadyQueued: false });
    const { pending } = await meta.queue();
    expect(pending).toHaveLength(1);
    await expect(meta.abort()).resolves.toEqual({ status: 'idle' });
    await expect(meta.queueClear()).resolves.toEqual({ cleared: 1 });
  });

  it('seed, then unlock (409 as MetaError), then unlock a locked meta', async () => {
    await expect(
      meta.seed({ path: path('seedTarget') }),
    ).resolves.toMatchObject({ status: 'created', path: path('seedTarget') });
    await expect(meta.unlock({ path: path('fresh') })).rejects.toMatchObject({
      status: 409,
      code: 'META_NOT_LOCKED',
    });
    await expect(meta.unlock({ path: path('locked') })).resolves.toEqual({
      status: 'unlocked',
      path: path('locked'),
    });
  });

  it('refuses invalid input without sending anything', async () => {
    const before = fetchSpy.mock.calls.length;
    await expect(meta.seed({ path: '' })).rejects.toMatchObject({
      code: 'invalid_request',
      status: 0,
    });
    expect(fetchSpy.mock.calls.length).toBe(before);
  });

  it('called every catalog entry', () => {
    expect([...called].sort()).toEqual(
      META_CATALOG.entries.map((e) => e.name).sort(),
    );
  });
});
