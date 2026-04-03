/**
 * Tests for POST /unlock — remove .lock from a .meta/ directory.
 *
 * @module routes/unlock.test
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RouteDeps } from './index.js';
import { registerUnlockRoute } from './unlock.js';

const unlockRoot = join(
  tmpdir(),
  `jeeves-meta-unlock-${Date.now().toString()}`,
);

function makeDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    config: {
      watcherUrl: 'http://localhost:3456',
      gatewayUrl: 'http://127.0.0.1:18789',
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
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger,
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

describe('POST /unlock', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    rmSync(unlockRoot, { recursive: true, force: true });
  });

  it('returns 200 and removes lock file when it exists', async () => {
    const metaDir = join(unlockRoot, 'locked', '.meta');
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      join(metaDir, '.lock'),
      JSON.stringify({
        _lockPid: 12345,
        _lockStartedAt: new Date().toISOString(),
      }),
    );

    const deps = makeDeps();
    app = Fastify();
    registerUnlockRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/unlock',
      payload: { path: metaDir },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; path: string }>();
    expect(body.status).toBe('unlocked');
    expect(body.path).toBe(metaDir);
    expect(existsSync(join(metaDir, '.lock'))).toBe(false);
  });

  it('returns 409 when no lock file exists', async () => {
    const metaDir = join(unlockRoot, 'unlocked', '.meta');
    mkdirSync(metaDir, { recursive: true });
    // No .lock file created

    const deps = makeDeps();
    app = Fastify();
    registerUnlockRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/unlock',
      payload: { path: metaDir },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('ALREADY_UNLOCKED');
  });

  it('returns 409 when meta path does not exist', async () => {
    const nonExistent = join(unlockRoot, 'nonexistent', '.meta');

    const deps = makeDeps();
    app = Fastify();
    registerUnlockRoute(app, deps);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/unlock',
      payload: { path: nonExistent },
    });

    // No lock file at nonexistent path → 409 ALREADY_UNLOCKED
    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: string }>();
    expect(body.error).toBe('ALREADY_UNLOCKED');
  });
});
