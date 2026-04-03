/**
 * Tests for config hot-reload logic.
 *
 * Exercises the mutable singleton runtime, restart-required field warnings,
 * schedule hot-reload, log-level hot-reload, and generic field merging.
 *
 * @module configHotReload.test
 */

import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyHotReloadedConfig,
  clearConfigHotReloadRuntime,
  registerConfigHotReloadRuntime,
  RESTART_REQUIRED_FIELDS,
} from './configHotReload.js';
import type { ServiceConfig } from './schema/config.js';
import { serviceConfigSchema } from './schema/config.js';

/** Build a valid ServiceConfig with overrides. */
function makeConfig(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return serviceConfigSchema.parse({
    watcherUrl: 'http://127.0.0.1:1936',
    ...overrides,
  });
}

/** Build a mock logger that tracks calls. */
function makeLogger(): Logger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
  } as unknown as Logger & {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

/** Build a mock scheduler. */
function makeScheduler() {
  return { updateSchedule: vi.fn() };
}

describe('applyHotReloadedConfig', () => {
  afterEach(() => {
    clearConfigHotReloadRuntime();
  });

  it('no-ops when runtime is not registered', () => {
    const config = makeConfig({ depthWeight: 0.5 });
    // Apply without registering runtime — config should be untouched
    applyHotReloadedConfig(makeConfig({ depthWeight: 99 }));
    expect(config.depthWeight).toBe(0.5);
  });

  it('warns on each restart-required field that changed', () => {
    const config = makeConfig({
      port: 1938,
      watcherUrl: 'http://127.0.0.1:1936',
      gatewayUrl: 'http://127.0.0.1:18789',
    });
    const logger = makeLogger();
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    const newConfig = makeConfig({
      port: 2000,
      watcherUrl: 'http://127.0.0.1:1936', // unchanged
      gatewayUrl: 'http://127.0.0.1:18789', // unchanged
    });
    applyHotReloadedConfig(newConfig);

    // port changed → 1 warning
    const warnCalls = logger.warn.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === 'string' && c[1].includes('requires restart'),
    );
    expect(warnCalls).toHaveLength(1);

    const warnedFields = warnCalls.map(
      (c: unknown[]) => (c[0] as { field: string }).field,
    );
    expect(warnedFields).toContain('port');
  });

  it('does not warn when restart-required fields are unchanged', () => {
    const config = makeConfig();
    const logger = makeLogger();
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    // Same config — no changes
    applyHotReloadedConfig(makeConfig());

    const warnCalls = logger.warn.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === 'string' && c[1].includes('requires restart'),
    );
    expect(warnCalls).toHaveLength(0);
  });

  it('hot-reloads schedule and calls scheduler.updateSchedule', () => {
    const config = makeConfig({ schedule: '*/30 * * * *' });
    const logger = makeLogger();
    const scheduler = makeScheduler();
    registerConfigHotReloadRuntime({
      config,
      logger,
      scheduler: scheduler as unknown as Parameters<
        typeof registerConfigHotReloadRuntime
      >[0]['scheduler'],
    });

    applyHotReloadedConfig(makeConfig({ schedule: '*/5 * * * *' }));

    expect(scheduler.updateSchedule).toHaveBeenCalledWith('*/5 * * * *');
    expect(config.schedule).toBe('*/5 * * * *');

    const infoCalls = logger.info.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === 'string' && c[1].includes('Schedule hot-reloaded'),
    );
    expect(infoCalls).toHaveLength(1);
  });

  it('hot-reloads schedule without scheduler (null)', () => {
    const config = makeConfig({ schedule: '*/30 * * * *' });
    const logger = makeLogger();
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    // Should not throw even with null scheduler
    applyHotReloadedConfig(makeConfig({ schedule: '*/5 * * * *' }));
    expect(config.schedule).toBe('*/5 * * * *');
  });

  it('hot-reloads log level and updates logger.level', () => {
    const config = makeConfig({ logging: { level: 'info' } });
    const logger = makeLogger();
    logger.level = 'info';
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    applyHotReloadedConfig(makeConfig({ logging: { level: 'debug' } }));

    expect(logger.level).toBe('debug');
    expect(config.logging.level).toBe('debug');

    const infoCalls = logger.info.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === 'string' && c[1].includes('Log level hot-reloaded'),
    );
    expect(infoCalls).toHaveLength(1);
  });

  it('does not hot-reload log level when unchanged', () => {
    const config = makeConfig({ logging: { level: 'info' } });
    const logger = makeLogger();
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    applyHotReloadedConfig(makeConfig({ logging: { level: 'info' } }));

    const infoCalls = logger.info.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === 'string' && c[1].includes('Log level hot-reloaded'),
    );
    expect(infoCalls).toHaveLength(0);
  });

  it('hot-reloads generic fields (not restart-required, schedule, or logging)', () => {
    const config = makeConfig({
      depthWeight: 0.5,
      maxArchive: 20,
      skipUnchanged: true,
    });
    const logger = makeLogger();
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    applyHotReloadedConfig(
      makeConfig({
        depthWeight: 1.0,
        maxArchive: 50,
        skipUnchanged: false,
      }),
    );

    expect(config.depthWeight).toBe(1.0);
    expect(config.maxArchive).toBe(50);
    expect(config.skipUnchanged).toBe(false);

    const infoCalls = logger.info.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === 'string' && c[1].includes('Config field hot-reloaded'),
    );
    expect(infoCalls).toHaveLength(3);
  });

  it('does not merge unchanged generic fields', () => {
    const config = makeConfig({ depthWeight: 0.5 });
    const logger = makeLogger();
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    applyHotReloadedConfig(makeConfig({ depthWeight: 0.5 }));

    const infoCalls = logger.info.mock.calls.filter(
      (c: unknown[]) =>
        typeof c[1] === 'string' && c[1].includes('Config field hot-reloaded'),
    );
    expect(infoCalls).toHaveLength(0);
  });

  it('clearConfigHotReloadRuntime causes subsequent applies to no-op', () => {
    const config = makeConfig();
    const logger = makeLogger();
    registerConfigHotReloadRuntime({ config, logger, scheduler: null });

    clearConfigHotReloadRuntime();

    applyHotReloadedConfig(makeConfig({ depthWeight: 99 }));
    // config should NOT have been mutated
    expect(config.depthWeight).toBe(0.5);
  });
});

describe('RESTART_REQUIRED_FIELDS', () => {
  it('contains the expected fields', () => {
    expect(RESTART_REQUIRED_FIELDS).toContain('port');
    expect(RESTART_REQUIRED_FIELDS).toContain('watcherUrl');
    expect(RESTART_REQUIRED_FIELDS).toContain('gatewayUrl');
    expect(RESTART_REQUIRED_FIELDS).toContain('gatewayApiKey');
    expect(RESTART_REQUIRED_FIELDS).toContain('defaultArchitect');
    expect(RESTART_REQUIRED_FIELDS).toContain('defaultCritic');
  });

  it('does not include hot-reloadable fields', () => {
    const arr = [...RESTART_REQUIRED_FIELDS] as string[];
    expect(arr).not.toContain('schedule');
    expect(arr).not.toContain('logging');
    expect(arr).not.toContain('depthWeight');
    expect(arr).not.toContain('maxArchive');
  });
});
