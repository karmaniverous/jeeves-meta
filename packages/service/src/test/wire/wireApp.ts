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

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
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

/** Fixture owner directories, relative to the fixture root. */
export const FIXTURE_OWNERS = {
  /** Recently synthesized, no error. */
  fresh: 'alpha',
  /** Synthesized long ago. */
  stale: 'alpha-stale',
  /** Last synthesis recorded an error. */
  error: 'alpha-error',
  /** `_disabled: true`. */
  disabled: 'alpha-disabled',
  /** Has an active (non-stale) `.lock` file. */
  locked: 'alpha-locked',
  /** `_crossRefs` to `fresh` (resolved) and a missing path. */
  crossref: 'alpha-crossref',
  /** Owner path containing a space. */
  spaced: 'sub dir with space/leaf',
  /** Owner path containing a literal `%`. */
  percent: 'pct%off',
  /** Fully synthesized — every phase fresh, owes nothing. */
  complete: 'alpha-complete',
  /** No `.meta/` yet — target for the seed-success scenario. */
  seedTarget: 'new-owner',
} as const;

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

const ISO_OLD = '2020-01-01T00:00:00.000Z';

/** Write one fixture owner's `.meta/meta.json` (and optional `.lock`). */
function writeOwner(
  dir: string,
  owner: string,
  meta: Record<string, unknown>,
  lock?: Record<string, unknown>,
): void {
  const metaDir = join(dir, owner, '.meta');
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(
    join(metaDir, 'meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
  );
  if (lock) {
    writeFileSync(join(metaDir, '.lock'), JSON.stringify(lock, null, 2) + '\n');
  }
}

/** Write the fixture corpus (every owner but `seedTarget`) under `dir`. */
function writeFixtures(dir: string): void {
  const nowRecent = new Date(Date.now() - 60_000).toISOString();

  writeOwner(dir, FIXTURE_OWNERS.fresh, {
    _id: '11111111-1111-1111-1111-111111111111',
    _generatedAt: nowRecent,
    _architectTokens: 100,
    _builderTokens: 200,
    _criticTokens: 50,
  });
  writeOwner(dir, FIXTURE_OWNERS.stale, {
    _id: '22222222-2222-2222-2222-222222222222',
    _generatedAt: ISO_OLD,
  });
  writeOwner(dir, FIXTURE_OWNERS.error, {
    _id: '33333333-3333-3333-3333-333333333333',
    _generatedAt: nowRecent,
    _error: {
      step: 'builder',
      message: 'timeout',
      timestamp: nowRecent,
    },
  });
  writeOwner(dir, FIXTURE_OWNERS.disabled, {
    _id: '44444444-4444-4444-4444-444444444444',
    _generatedAt: nowRecent,
    _disabled: true,
  });
  writeOwner(
    dir,
    FIXTURE_OWNERS.locked,
    {
      _id: '55555555-5555-5555-5555-555555555555',
      _generatedAt: nowRecent,
    },
    { _lockPid: 999999, _lockStartedAt: new Date().toISOString() },
  );
  writeOwner(dir, FIXTURE_OWNERS.crossref, {
    _id: '66666666-6666-6666-6666-666666666666',
    _generatedAt: nowRecent,
    _crossRefs: [
      normalizePath(join(dir, FIXTURE_OWNERS.fresh)),
      normalizePath(join(dir, 'does-not-exist')),
    ],
  });
  writeOwner(dir, FIXTURE_OWNERS.spaced, {
    _id: '77777777-7777-7777-7777-777777777777',
    _generatedAt: nowRecent,
  });
  writeOwner(dir, FIXTURE_OWNERS.percent, {
    _id: '88888888-8888-8888-8888-888888888888',
    _generatedAt: nowRecent,
  });
  writeOwner(dir, FIXTURE_OWNERS.complete, {
    _id: '99999999-9999-9999-9999-999999999999',
    _generatedAt: nowRecent,
    _content: 'synthesis done',
    _builder: 'build brief',
    // sha256 of an empty scope: the owner has no files besides .meta/.
    _structureHash:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    _synthesisCount: 1,
    _phaseState: { architect: 'fresh', builder: 'fresh', critic: 'fresh' },
    _architectTokens: 10,
    _builderTokens: 20,
    _criticTokens: 5,
  });
}

/** Remove every fixture owner under `dir`, including `seedTarget`. */
function clearFixtures(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      rmSync(join(dir, entry.name), {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    }
  }
}

/** Recursively find every `.meta/meta.json` file under `root`. */
function walkFixtures(root: string): string[] {
  const out: string[] = [];
  const visit = (dirPath: string): void => {
    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.meta') {
          const metaJson = join(full, 'meta.json');
          if (existsSync(metaJson)) out.push(normalizePath(metaJson));
        } else {
          visit(full);
        }
      }
    }
  };
  visit(root);
  return out;
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

/**
 * Remove every fixture owner's `meta.json` except `keep`, so a corpus-wide
 * request sees exactly one candidate.
 *
 * @param wire - The wire app.
 * @param keep - The owner to keep.
 */
export function keepOnly(
  wire: WireApp,
  keep: keyof typeof FIXTURE_OWNERS,
): void {
  for (const [key, owner] of Object.entries(FIXTURE_OWNERS)) {
    const metaJson = join(wire.dir, owner, '.meta', 'meta.json');
    if (key !== keep && existsSync(metaJson)) unlinkSync(metaJson);
  }
}
