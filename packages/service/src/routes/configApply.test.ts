/**
 * @module routes/configApply.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../configHotReload.js', () => ({
  applyHotReloadedConfig: vi.fn(),
  RESTART_REQUIRED_FIELDS: ['port'],
}));

describe('POST /config/apply', () => {
  let app: FastifyInstance | undefined;
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `config-apply-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    configPath = join(testDir, 'config.json');

    // Write a base config with required fields
    writeFileSync(
      configPath,
      JSON.stringify({
        watcherUrl: 'http://localhost:3456',
        schedule: '*/30 * * * *',
      }),
    );

    const { registerConfigApplyRoute } = await import('./configApply.js');
    app = Fastify();
    registerConfigApplyRoute(app, configPath);
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('applies a valid config patch and returns applied: true', async () => {
    const body = { patch: { schedule: '*/5 * * * *' } };
    const res = await app!.inject({
      method: 'POST',
      url: '/config/apply',
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json<{ applied: boolean; config: unknown }>();
    expect(json.applied).toBe(true);
    expect(json.config).toBeDefined();
  });

  it('returns 400 for invalid config patches', async () => {
    const res = await app!.inject({
      method: 'POST',
      url: '/config/apply',
      payload: { patch: { port: 'bad' } },
    });

    expect(res.statusCode).toBe(400);
    const json = res.json<{ error: string }>();
    expect(json.error).toBe('Config validation failed');
  });

  it('returns 500 when no configPath is set', async () => {
    const noPathApp = Fastify();
    const { registerConfigApplyRoute } = await import('./configApply.js');
    registerConfigApplyRoute(noPathApp);
    await noPathApp.ready();

    const res = await noPathApp.inject({
      method: 'POST',
      url: '/config/apply',
      payload: { patch: { schedule: '*/5 * * * *' } },
    });

    expect(res.statusCode).toBe(500);
    await noPathApp.close();
  });
});
