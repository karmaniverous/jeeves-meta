/**
 * Tests for POST /unlock — remove .lock from a .meta/ directory.
 *
 * @module routes/unlock.test
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { makeTestDeps } from './__testUtils.js';
import { registerUnlockRoute } from './unlock.js';

const unlockRoot = join(
  tmpdir(),
  `jeeves-meta-unlock-${Date.now().toString()}`,
);

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

    const deps = makeTestDeps();
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

    const deps = makeTestDeps();
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

    const deps = makeTestDeps();
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
