/**
 * @module api/errorContract.test
 * The error contract of spec 4.4.3–4.4.4 beyond the wire replay: each
 * meta error's message, no `Retry-After` on any reply (Decision 194), the
 * masked and logged 500 for an unexpected error, the response-validation
 * 500 (Decision 207), the config-unavailable 500, and infinite staleness
 * sent as `null`.
 */

import { Writable } from 'node:stream';

import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MetaCache } from '../cache.js';
import type { MetaListResult } from '../discovery/index.js';
import {
  createTestApp,
  makeFailingTestWatcher,
  makeTestDeps,
} from '../routes/__testUtils.js';
import { createServer } from '../server.js';
import { scenariosFor } from '../test/wire/scenarios.js';
import { startWireApp, type WireApp } from '../test/wire/wireApp.js';
import { injectScenario } from '../test/wire/wireRun.js';

vi.mock('../configHotReload.js', () => ({
  applyHotReloadedConfig: vi.fn(),
  RESTART_REQUIRED_FIELDS: ['port', 'gatewayApiKey'],
}));

let wire: WireApp;

beforeAll(async () => {
  wire = await startWireApp();
});

afterAll(async () => {
  await wire.close();
});

/** Each 4.4.4 row's message, by wire scenario. */
const MESSAGES: Array<[string, string, RegExp]> = [
  [
    'metaDetail unknown meta',
    'META_NOT_FOUND',
    /^Meta path not found: .+\/does-not-exist$/,
  ],
  [
    'updateMeta unknown meta',
    'META_NOT_FOUND',
    /^Meta path not found: .+\/does-not-exist$/,
  ],
  [
    'preview unknown meta',
    'META_NOT_FOUND',
    /^Meta path not found: .+\/does-not-exist$/,
  ],
  [
    'listMetas watcher unreachable',
    'META_WATCHER_UNAVAILABLE',
    /^Watcher unreachable — cannot list metas$/,
  ],
  [
    'preview watcher unreachable',
    'META_WATCHER_UNAVAILABLE',
    /^Watcher unreachable — cannot compute preview$/,
  ],
  [
    'synthesize watcher unreachable',
    'META_WATCHER_UNAVAILABLE',
    /^Watcher unreachable — cannot discover candidates$/,
  ],
  [
    'seed conflict',
    'META_ALREADY_EXISTS',
    /^\.meta directory already exists at .+\/alpha$/,
  ],
  [
    'unlock not locked',
    'META_NOT_LOCKED',
    /^No lock file at .+\/alpha \(already unlocked\)$/,
  ],
  [
    'status not ready',
    'META_NOT_READY',
    /^The service is starting; retry shortly\.$/,
  ],
  ['config invalid jsonpath', 'META_INVALID_JSONPATH', /^Invalid JSONPath: .+/],
];

describe('meta error messages (4.4.4)', () => {
  it.each(MESSAGES)('%s: %s', async (name, code, message) => {
    const scenario = scenariosFor(wire).find((s) => s.name === name);
    expect(scenario).toBeDefined();
    const res = await injectScenario(wire, scenario as never);
    expect(res.json()).toMatchObject({
      code,
      message: expect.stringMatching(message) as unknown,
    });
  });
});

describe('Retry-After (Decision 194)', () => {
  it.each(
    scenariosFor({
      dir: '',
      ownerPath: (p: string) => p,
    } as unknown as WireApp).map((s) => s.name),
  )('%s sends no Retry-After', async (name) => {
    const scenario = scenariosFor(wire).find((s) => s.name === name);
    const res = await injectScenario(wire, scenario as never);
    expect(res.headers['retry-after']).toBeUndefined();
  });
});

describe('unexpected and contract failures', () => {
  it('masks an unexpected error as a codeless 500 and logs it', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const watcher = makeFailingTestWatcher();
    const app = createServer({
      logger: pino({ level: 'error' }, stream),
      deps: makeTestDeps({ watcher }),
    });
    const res = await app.inject({ method: 'GET', url: '/metas/j%3A%2Fx' });
    await app.close();
    expect(res.statusCode).toBe(500);
    const body = res.json<Record<string, unknown>>();
    expect(body).not.toHaveProperty('code');
    expect(JSON.stringify(body)).not.toContain('connection refused');
    expect(lines.join('')).toContain('connection refused');
  });

  it('answers a response that breaks its schema with 500 JEEVES_RESPONSE_VALIDATION', async () => {
    const deps = makeTestDeps();
    vi.spyOn(deps.queue, 'clear').mockReturnValue('three' as never);
    const app = createTestApp(deps);
    const res = await app.inject({ method: 'POST', url: '/queue/clear' });
    await app.close();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'JEEVES_RESPONSE_VALIDATION' });
  });

  it('answers configApply without a runtime config path with 500 META_CONFIG_UNAVAILABLE', async () => {
    const app = createTestApp(makeTestDeps());
    const res = await app.inject({
      method: 'POST',
      url: '/config/apply',
      payload: { patch: {} },
    });
    await app.close();
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({
      code: 'META_CONFIG_UNAVAILABLE',
      message: 'No runtime config path available',
    });
  });
});

describe('infinite staleness', () => {
  it('is sent as null in GET /queue automatic', async () => {
    const cache = new MetaCache();
    vi.spyOn(cache, 'get').mockResolvedValue({
      entries: [
        {
          path: 'j:/a',
          depth: 0,
          emphasis: 1,
          stalenessSeconds: Infinity,
          hasError: false,
          locked: false,
          disabled: false,
          lastSynthesized: null,
          node: { metaPath: 'j:/a/.meta', ownerPath: 'j:/a', children: [] },
          meta: {},
        },
      ],
    } as unknown as MetaListResult);
    const app = createTestApp(makeTestDeps({ cache }));
    const res = await app.inject({ method: 'GET', url: '/queue' });
    await app.close();
    expect(res.statusCode).toBe(200);
    const body = res.json<{ automatic: Array<Record<string, unknown>> }>();
    expect(body.automatic).toHaveLength(1);
    expect(body.automatic[0].effectiveStaleness).toBeNull();
  });
});
