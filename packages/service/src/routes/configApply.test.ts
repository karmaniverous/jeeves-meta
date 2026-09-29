/**
 * @module routes/configApply.test
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createConfigApplyHandler } from '@karmaniverous/jeeves';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../configHotReload.js', () => ({
  applyHotReloadedConfig: vi.fn(),
  RESTART_REQUIRED_FIELDS: ['port', 'gatewayApiKey'],
}));

const { metaDescriptor } = await import('../descriptor.js');
const { registerConfigApplyRoute } = await import('./configApply.js');

/**
 * Base config: includes keys the schema does not know (api, configRoot,
 * defaultArchitect, defaultCritic, serverBaseUrl) and omits defaulted keys.
 */
const BASE_CONFIG = {
  watcherUrl: 'http://localhost:3456',
  schedule: '*/30 * * * *',
  port: 1938,
  gatewayApiKey: 'secret-key',
  logging: { level: 'info', file: 'meta.log' },
  metaProperty: { domains: ['meta'] },
  metaArchiveProperty: { domains: ['meta-archive'] },
  api: { keep: true },
  configRoot: 'J:/config',
  defaultArchitect: 'architect prompt',
  defaultCritic: 'critic prompt',
  serverBaseUrl: 'http://localhost:1934',
};

const BASE_TEXT = JSON.stringify(BASE_CONFIG, null, 2) + '\n';

describe('POST /config/apply', () => {
  let app: FastifyInstance;
  let testDir: string;
  let configPath: string;

  const apply = (payload: unknown) =>
    app.inject({
      method: 'POST',
      url: '/config/apply',
      payload: payload as object,
    });

  const readFile = () =>
    JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `config-apply-test-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
    configPath = join(testDir, 'config.json');
    writeFileSync(configPath, BASE_TEXT);

    app = Fastify();
    registerConfigApplyRoute(
      app,
      createConfigApplyHandler(metaDescriptor, configPath),
      configPath,
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('applies a valid patch without echoing the (secret-bearing) config', async () => {
    const res = await apply({ patch: { schedule: '*/5 * * * *' } });

    expect(res.statusCode).toBe(200);
    const json = res.json<Record<string, unknown>>();
    expect(json.applied).toBe(true);
    expect(json).not.toHaveProperty('config');
    expect(res.body).not.toContain('secret-key');
  });

  it('changes only the patched key: unknown keys survive, no defaults injected', async () => {
    const res = await apply({ patch: { schedule: '*/5 * * * *' } });

    expect(res.statusCode).toBe(200);
    expect(readFile()).toEqual({ ...BASE_CONFIG, schedule: '*/5 * * * *' });
  });

  it('deep-merges nested patches into the raw file', async () => {
    const res = await apply({ patch: { logging: { level: 'debug' } } });

    expect(res.statusCode).toBe(200);
    expect(readFile()).toEqual({
      ...BASE_CONFIG,
      logging: { level: 'debug', file: 'meta.log' },
    });
  });

  it.skipIf(process.platform === 'win32')(
    'preserves mode 0600 on the config file',
    async () => {
      chmodSync(configPath, 0o600);

      const res = await apply({ patch: { schedule: '*/5 * * * *' } });

      expect(res.statusCode).toBe(200);
      expect(statSync(configPath).mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'creates a missing config file with mode 0600',
    async () => {
      rmSync(configPath);

      const res = await apply({ patch: { watcherUrl: 'http://x:1936' } });

      expect(res.statusCode).toBe(200);
      expect(existsSync(configPath)).toBe(true);
      expect(statSync(configPath).mode & 0o777).toBe(0o600);
    },
  );

  it('returns 400 and leaves the file byte-identical for an invalid patch', async () => {
    const before = readFileSync(configPath);

    const res = await apply({ patch: { port: 'bad' } });

    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe(
      'Config validation failed',
    );
    expect(readFileSync(configPath).equals(before)).toBe(true);
  });

  it('returns 500 and leaves the file untouched when it is not valid JSON', async () => {
    writeFileSync(configPath, '{ not json');

    const res = await apply({ patch: { schedule: '*/5 * * * *' } });

    expect(res.statusCode).toBe(500);
    expect(readFileSync(configPath, 'utf8')).toBe('{ not json');
  });

  it('returns restartRequired: true when a restart-required field changes', async () => {
    const res = await apply({ patch: { port: 9999 } });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ restartRequired: boolean }>().restartRequired).toBe(true);
  });

  it('returns restartRequired: false when no restart-required field changes', async () => {
    const res = await apply({ patch: { schedule: '*/10 * * * *' } });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ restartRequired: boolean }>().restartRequired).toBe(
      false,
    );
  });

  it('rejects a non-object patch', async () => {
    const res = await apply({ patch: [1] });

    expect(res.statusCode).toBe(400);
    expect(readFileSync(configPath, 'utf8')).toBe(BASE_TEXT);
  });

  it('returns 500 when no config apply handler is wired', async () => {
    const noPathApp = Fastify();
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
