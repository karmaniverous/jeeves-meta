/**
 * @module test/wire/scenarios
 * Wire scenarios for every jeeves-meta route and outcome (spec 4.4.2,
 * Decision 211): success and error cases for all 13 endpoints, the
 * readiness gate, an unknown route and an encoded `%` path. Run by
 * `wireRun`; no assertions. Fixture paths depend on the temp directory, so
 * scenarios are built against a started {@link WireApp}.
 */

import { type WireApp } from './wireApp.js';
import { FIXTURE_OWNERS, keepOnly } from './wireFixtures.js';
import { get, patch, post, scenario, type WireScenario } from './wireTypes.js';

/** Fixture owner key. */
type Owner = keyof typeof FIXTURE_OWNERS;

/**
 * Every scenario, in run order.
 *
 * @param wire - The started wire app.
 * @returns The scenarios.
 */
export function scenariosFor(wire: WireApp): WireScenario[] {
  const path = (key: Owner): string => wire.ownerPath(FIXTURE_OWNERS[key]);
  const missing = wire.ownerPath('does-not-exist');
  const metaUrl = (p: string): string => `/metas/${encodeURIComponent(p)}`;
  const previewUrl = (p: string): string =>
    `/preview?path=${encodeURIComponent(p)}`;
  const notReady = { state: { ready: false } };
  const unreachable = { state: { walk: 'unreachable' as const } };

  return [
    // status
    get('status', '/status'),
    get('status not ready', '/status', notReady),

    // listMetas
    get('listMetas', '/metas'),
    get(
      'listMetas pathPrefix',
      `/metas?pathPrefix=${encodeURIComponent(path('stale'))}`,
    ),
    get('listMetas fields', '/metas?fields=path,hasError'),
    get('listMetas hasError', '/metas?hasError=true'),
    get('listMetas locked', '/metas?locked=true'),
    get('listMetas disabled', '/metas?disabled=true'),
    get('listMetas malformed staleHours', '/metas?staleHours=abc'),
    get('listMetas watcher unreachable', '/metas', unreachable),
    get('listMetas not ready', '/metas', notReady),

    // metaDetail
    get('metaDetail', metaUrl(path('fresh'))),
    get(
      'metaDetail fields',
      `${metaUrl(path('fresh'))}?fields=_id,_generatedAt`,
    ),
    get('metaDetail crossRefs', metaUrl(path('crossref'))),
    get(
      'metaDetail includeArchive',
      `${metaUrl(path('fresh'))}?includeArchive=true`,
    ),
    get(
      'metaDetail malformed includeArchive',
      `${metaUrl(path('fresh'))}?includeArchive=foo`,
    ),
    get('metaDetail spaced path', metaUrl(path('spaced'))),
    get('metaDetail percent path', metaUrl(path('percent'))),
    get('metaDetail unknown meta', metaUrl(missing)),

    // updateMeta
    patch('updateMeta', metaUrl(path('fresh')), {
      _steer: 'focus on tests',
      _emphasis: 2,
    }),
    patch('updateMeta unknown meta', metaUrl(missing), { _steer: 'x' }),
    patch('updateMeta invalid body', metaUrl(path('fresh')), {
      unknownKey: true,
    }),
    patch('updateMeta engine key', metaUrl(path('fresh')), { _content: 'x' }),

    // synthesize
    post('synthesize targeted', '/synthesize', { path: path('stale') }),
    post('synthesize targeted owes nothing', '/synthesize', {
      path: path('complete'),
    }),
    post(
      'synthesize corpus-wide',
      '/synthesize',
      {},
      {
        setup: (w) => {
          keepOnly(w.dir, 'stale');
        },
      },
    ),
    post(
      'synthesize nothing stale',
      '/synthesize',
      {},
      {
        setup: (w) => {
          keepOnly(w.dir, 'complete');
        },
      },
    ),
    post('synthesize unknown meta', '/synthesize', { path: missing }),
    post('synthesize watcher unreachable', '/synthesize', {}, unreachable),
    post('synthesize malformed body', '/synthesize', { path: 123 }),

    // abort
    scenario('abort idle', 'POST', '/synthesize/abort'),
    scenario('abort running', 'POST', '/synthesize/abort', {
      setup: (w) => {
        w.deps.queue.setCurrentPhase(path('stale'), 'builder');
      },
    }),

    // preview
    get('preview targeted', previewUrl(path('stale'))),
    get('preview corpus-wide', '/preview', {
      setup: (w) => {
        keepOnly(w.dir, 'stale');
      },
    }),
    get('preview nothing stale', '/preview', {
      setup: (w) => {
        keepOnly(w.dir, 'complete');
      },
    }),
    get('preview unknown meta', previewUrl(missing)),
    get('preview watcher unreachable', '/preview', unreachable),

    // seed
    post('seed', '/seed', { path: path('seedTarget') }),
    post('seed conflict', '/seed', { path: path('fresh') }),
    post('seed malformed body', '/seed', {}),

    // unlock
    post('unlock', '/unlock', { path: path('locked') }),
    post('unlock not locked', '/unlock', { path: path('fresh') }),
    post('unlock malformed body', '/unlock', {}),

    // config
    get('config', '/config'),
    get('config jsonpath', '/config?path=%24.port'),
    get('config invalid jsonpath', '/config?path=%24%5B((('),
    get('config not ready', '/config', notReady),
    get('config jsonpath not ready', '/config?path=%24.port', notReady),

    // configApply
    post('configApply', '/config/apply', { patch: { thinking: 'medium' } }),
    post('configApply restart field', '/config/apply', {
      patch: { port: 1939 },
    }),
    post('configApply invalid config', '/config/apply', {
      patch: { port: 'x' },
    }),
    post('configApply empty body', '/config/apply', {}),
    post('configApply non-object patch', '/config/apply', { patch: [1] }),
    post('configApply non-boolean replace', '/config/apply', {
      patch: {},
      replace: 'yes',
    }),
    scenario('configApply no body', 'POST', '/config/apply'),
    post(
      'configApply not ready',
      '/config/apply',
      { patch: { thinking: 'medium' } },
      notReady,
    ),

    // queue
    get('queue empty', '/queue'),
    get('queue pending and current', '/queue', {
      setup: (w) => {
        w.deps.queue.enqueue(path('stale'));
        w.deps.queue.setCurrentPhase(path('error'), 'critic');
      },
    }),
    scenario('queueClear', 'POST', '/queue/clear', {
      setup: (w) => {
        w.deps.queue.enqueue(path('stale'));
      },
    }),

    // unknown route
    get('unknown route', '/nope'),
  ];
}
