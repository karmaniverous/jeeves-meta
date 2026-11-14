/**
 * @module customTools.test
 * What each custom tool sends (spec 4.4.7): tool parameters mapped to the
 * SDK input as 0.16.0 mapped them to the URL (boolean filters as
 * `true`/`false`, field lists comma-joined, absent values left out), and
 * the tools' own parameter errors.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCustomTools } from './customTools.js';

const BASE = 'http://127.0.0.1:1938';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Run a tool; return the URL and init of the request it sent. */
async function sent(name: string, params: Record<string, unknown>) {
  const fetchStub = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({})),
  );
  vi.stubGlobal('fetch', fetchStub);
  const tool = buildCustomTools(BASE).find((t) => t.name === name);
  const result = await tool!.execute('id', params);
  const [url, init] = fetchStub.mock.calls[0] ?? [];
  return { url: url as string | undefined, init, result };
}

describe('request mapping', () => {
  it('meta_list sends filters as true/false and fields comma-joined', async () => {
    const { url } = await sent('meta_list', {
      pathPrefix: 'j:/a',
      filter: { hasError: true, locked: false, staleHours: 2 },
      fields: ['path', 'owedPhase'],
    });
    const query = new URL(url!).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      pathPrefix: 'j:/a',
      hasError: 'true',
      locked: 'false',
      staleHours: '2',
      fields: 'path,owedPhase',
    });
  });

  it('meta_list leaves out absent and empty values', async () => {
    const { url } = await sent('meta_list', { pathPrefix: '', fields: [] });
    expect(url).toBe(`${BASE}/metas`);
  });

  it('meta_detail encodes the path once and passes includeArchive', async () => {
    const { url } = await sent('meta_detail', {
      path: 'j:/a b',
      includeArchive: 3,
      fields: ['_id'],
    });
    const sentUrl = new URL(url!);
    expect(sentUrl.pathname).toBe('/metas/j%3A%2Fa%20b');
    expect(Object.fromEntries(sentUrl.searchParams)).toEqual({
      includeArchive: '3',
      fields: '_id',
    });
  });

  it('meta_update sends the updates as the PATCH body', async () => {
    const { url, init } = await sent('meta_update', {
      path: 'j:/a',
      updates: { _steer: null, _emphasis: 2 },
    });
    expect(url).toBe(`${BASE}/metas/j%3A%2Fa`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      _steer: null,
      _emphasis: 2,
    });
  });

  it('meta_seed parses crossRefs JSON into the body', async () => {
    const { init } = await sent('meta_seed', {
      path: 'j:/a',
      crossRefs: '["j:/b"]',
      steer: 's',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      path: 'j:/a',
      crossRefs: ['j:/b'],
      steer: 's',
    });
  });
});

describe("the tools' own parameter errors", () => {
  it('meta_seed refuses invalid crossRefs JSON without a request', async () => {
    const { url, result } = await sent('meta_seed', {
      path: 'j:/a',
      crossRefs: '[oops',
    });
    expect(url).toBeUndefined();
    expect(JSON.stringify(result)).toContain('Invalid JSON in crossRefs');
  });

  it('meta_queue refuses an unknown action without a request', async () => {
    const { url, result } = await sent('meta_queue', { action: 'nope' });
    expect(url).toBeUndefined();
    expect(JSON.stringify(result)).toContain('Unknown action: nope');
  });
});
