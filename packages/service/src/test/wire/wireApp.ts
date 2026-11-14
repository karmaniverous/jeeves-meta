/**
 * @module test/wire/wireApp
 * The real `createServer` over a fixture corpus of `.meta/` directories on
 * disk and a watcher double that walks the fixture tree, for the service's
 * wire baseline (spec 4.4.2, Decision 211). Writes temp files; no network
 * except the `/status` route's own dependency probes, which hit a closed
 * local port and resolve deterministically "unreachable". Callers must
 * `vi.mock('../../configHotReload.js')` (see `wireRecord.record.ts`).
 *
 * The harness must stay portable to tag `service/0.19.0`
 * (`scripts/capture-wire.ts` copies it there): it may only import
 * service modules that already exist at that tag.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createConfigApplyHandler } from '@karmaniverous/jeeves';
import type { FastifyInstance } from 'fastify';
import { pino } from 'pino';
import { vi } from 'vitest';

import { MetaCache } from '../../cache.js';
import { metaDescriptor } from '../../descriptor.js';
import type { WatcherClient } from '../../interfaces/index.js';
import { normalizePath } from '../../normalizePath.js';
import { SynthesisQueue } from '../../queue/index.js';
import { makeTestDeps, makeTestLogger } from '../../routes/__testUtils.js';
import type { RouteDeps } from '../../routes/index.js';
import { createServer } from '../../server.js';
import { clearFixtures, walkFixtures, writeFixtures } from './wireFixtures.js';

/** A local port nothing listens on: dependency probes fail fast. */
const CLOSED_URL = 'http://127.0.0.1:9';

/** Runtime config file content for `POST /config/apply`. */
const CONFIG_TEXT =
  JSON.stringify(
    {
      watcherUrl: CLOSED_URL,
      gatewayUrl: CLOSED_URL,
      schedule: '*/30 * * * *',
      port: 1938,
      logging: { level: 'info' },
      metaProperty: { domains: ['meta'] },
      metaArchiveProperty: { domains: ['meta-archive'] },
    },
    null,
    2,
  ) + '\n';

/** How the stub watcher answers `walk`. */
export type WalkOutcome = 'ok' | 'unreachable';

/** Scriptable dependency behaviour, reset before every scenario. */
export interface WireState {
  /** Route readiness gate (`deps.ready`). */
  ready: boolean;
  /** `watcher.walk` outcome. */
  walk: WalkOutcome;
}

/** Behaviour every scenario starts from. */
export const DEFAULT_WIRE_STATE: WireState = {
  ready: true,
  walk: 'ok',
};

/** A started wire app. */
export interface WireApp {
  /** The Fastify app from `createServer`. */
  app: FastifyInstance;
  /** Route dependencies (mutate `ready` per scenario). */
  deps: RouteDeps;
  /** Live behaviour (mutated per scenario by `wireRun`). */
  state: WireState;
  /** Fixture root directory. */
  dir: string;
  /** Resolve a fixture owner's absolute, normalised path. */
  ownerPath: (owner: string) => string;
  /** Restore the fixture tree and {@link DEFAULT_WIRE_STATE}. */
  reset: () => void;
  /** Close the app and remove temp files. */
  close: () => Promise<void>;
}

/** Build the watcher double over the live fixture tree. */
function stubWatcher(dir: string, state: WireState): WatcherClient {
  return {
    registerRules: vi.fn().mockResolvedValue(undefined),
    walk: () => {
      if (state.walk === 'unreachable') {
        return Promise.reject(new Error('connection refused'));
      }
      return Promise.resolve(walkFixtures(dir));
    },
    scan: vi.fn().mockResolvedValue({ points: [], cursor: null }),
  };
}

/**
 * Start the wire app: fixture corpus on disk, real `createServer`, a
 * watcher double over the fixture tree.
 *
 * @returns The started app; call `close` in `afterAll`.
 */
export async function startWireApp(): Promise<WireApp> {
  const root = mkdtempSync(join(tmpdir(), 'jeeves-meta-wire-'));
  const dir = join(root, 'corpus');
  mkdirSync(dir);
  writeFixtures(dir);
  const configPath = join(root, 'config.json');

  const state: WireState = { ...DEFAULT_WIRE_STATE };
  const watcher = stubWatcher(dir, state);

  const deps: RouteDeps = makeTestDeps({
    config: { watcherUrl: CLOSED_URL, gatewayUrl: CLOSED_URL },
    logger: makeTestLogger(),
    queue: new SynthesisQueue(makeTestLogger()),
    watcher,
    cache: new MetaCache(),
    ready: state.ready,
    executor: { abort: vi.fn() },
    configPath,
    configApply: createConfigApplyHandler(metaDescriptor, configPath),
  });

  const app = createServer({ logger: pino({ level: 'silent' }), deps });
  await app.ready();

  return {
    app,
    deps,
    state,
    dir,
    ownerPath: (owner: string) => normalizePath(join(dir, owner)),
    reset: () => {
      Object.assign(state, DEFAULT_WIRE_STATE);
      deps.ready = true;
      deps.queue.clear();
      deps.queue.clearCurrentPhase();
      deps.cache.invalidate();
      clearFixtures(dir);
      writeFixtures(dir);
      writeFileSync(configPath, CONFIG_TEXT);
    },
    close: async () => {
      await app.close();
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
