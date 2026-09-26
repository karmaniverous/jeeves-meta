/**
 * Tests for lazy configRoot resolution.
 *
 * @module configRoot.test
 */

import {
  getConfigRoot,
  type PluginApi,
  resetInit,
  type ToolDescriptor,
} from '@karmaniverous/jeeves';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONFIG_ROOT_WARNING,
  createConfigRootGate,
  requireConfigRoot,
  warnIfConfigRootMissing,
} from './configRoot.js';
import { CONFIG_ROOT_MISSING_MESSAGE } from './helpers.js';

const PLUGIN_ID = 'jeeves-meta-openclaw';
const ROOT = process.cwd();

function makeApi(config?: Record<string, unknown>): PluginApi {
  return {
    config: { plugins: { entries: { [PLUGIN_ID]: { config } } } },
    resolvePath: () => ROOT,
    registerTool: () => {},
  };
}

function fakeTool(): ToolDescriptor {
  return {
    name: 'meta_service',
    description: 'fake',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn(() =>
      Promise.resolve({ content: [{ type: 'text' as const, text: 'ran' }] }),
    ),
  };
}

describe('createConfigRootGate', () => {
  const originalEnv = process.env['JEEVES_CONFIG_ROOT'];

  beforeEach(() => {
    delete process.env['JEEVES_CONFIG_ROOT'];
    resetInit();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['JEEVES_CONFIG_ROOT'];
    else process.env['JEEVES_CONFIG_ROOT'] = originalEnv;
    resetInit();
  });

  it('does not initialize core until ensure() is called', () => {
    createConfigRootGate(makeApi({ configRoot: ROOT }));
    expect(() => getConfigRoot()).toThrow('init() must be called first');
  });

  it('returns the missing-config error when unset', () => {
    const gate = createConfigRootGate(makeApi({}));
    expect(gate.ensure()).toEqual({
      ok: false,
      error: CONFIG_ROOT_MISSING_MESSAGE,
    });
    expect(() => getConfigRoot()).toThrow('init() must be called first');
  });

  it('initializes core from plugin config', () => {
    const gate = createConfigRootGate(makeApi({ configRoot: ROOT }));
    expect(gate.ensure()).toEqual({ ok: true, configRoot: ROOT });
    expect(getConfigRoot()).toBe(ROOT);
  });

  it('initializes core from JEEVES_CONFIG_ROOT', () => {
    process.env['JEEVES_CONFIG_ROOT'] = ROOT;
    const gate = createConfigRootGate(makeApi({}));
    expect(gate.ensure()).toEqual({ ok: true, configRoot: ROOT });
    expect(getConfigRoot()).toBe(ROOT);
  });

  it('picks up config that appears after the gate was created', () => {
    const gate = createConfigRootGate(makeApi({}));
    expect(gate.ensure().ok).toBe(false);
    process.env['JEEVES_CONFIG_ROOT'] = ROOT;
    expect(gate.ensure()).toEqual({ ok: true, configRoot: ROOT });
  });

  it('caches the resolved root', () => {
    process.env['JEEVES_CONFIG_ROOT'] = ROOT;
    const gate = createConfigRootGate(makeApi({}));
    gate.ensure();
    delete process.env['JEEVES_CONFIG_ROOT'];
    expect(gate.ensure()).toEqual({ ok: true, configRoot: ROOT });
  });

  it('reports a core init failure as an error', () => {
    const api = makeApi({ configRoot: ROOT });
    api.resolvePath = () => {
      throw new Error('boom');
    };
    api.config = { ...api.config, agents: undefined };
    const cwd = vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('no cwd');
    });
    try {
      const check = createConfigRootGate(api).ensure();
      expect(check.ok).toBe(false);
    } finally {
      cwd.mockRestore();
    }
  });
});

describe('warnIfConfigRootMissing', () => {
  beforeEach(() => {
    delete process.env['JEEVES_CONFIG_ROOT'];
  });

  it('warns through api.logger when unset', () => {
    const warn = vi.fn();
    warnIfConfigRootMissing({ ...makeApi({}), logger: { warn } });
    expect(warn).toHaveBeenCalledExactlyOnceWith(CONFIG_ROOT_WARNING);
  });

  it('falls back to console.warn without a host logger', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      warnIfConfigRootMissing(makeApi({}));
      expect(spy).toHaveBeenCalledExactlyOnceWith(CONFIG_ROOT_WARNING);
    } finally {
      spy.mockRestore();
    }
  });

  it('is silent when configRoot is set', () => {
    const warn = vi.fn();
    warnIfConfigRootMissing({
      ...makeApi({ configRoot: ROOT }),
      logger: { warn },
    });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('requireConfigRoot', () => {
  beforeEach(() => {
    delete process.env['JEEVES_CONFIG_ROOT'];
    resetInit();
  });

  it('returns a clear tool error without calling the tool when unset', async () => {
    const tool = fakeTool();
    const wrapped = requireConfigRoot(tool, createConfigRootGate(makeApi({})));
    const result = await wrapped.execute('id', {});
    expect(JSON.stringify(result)).toContain('configRoot not configured');
    expect(JSON.stringify(result)).toContain('JEEVES_CONFIG_ROOT');
    expect(tool.execute).not.toHaveBeenCalled();
  });

  it('delegates to the tool once configRoot resolves', async () => {
    const tool = fakeTool();
    const wrapped = requireConfigRoot(
      tool,
      createConfigRootGate(makeApi({ configRoot: ROOT })),
    );
    expect(wrapped.name).toBe('meta_service');
    const result = await wrapped.execute('id', { action: 'status' });
    expect(JSON.stringify(result)).toContain('ran');
    expect(tool.execute).toHaveBeenCalledWith('id', { action: 'status' });
  });
});
