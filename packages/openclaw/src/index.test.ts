/**
 * Tests for plugin registration.
 *
 * @module index.test
 */

import { readFileSync } from 'node:fs';

import {
  type PluginApi,
  recordRegisteredHooks,
  resetInit,
  type ToolDescriptor,
  validateConversationHooks,
} from '@karmaniverous/jeeves';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG_ROOT_WARNING } from './configRoot.js';
import register from './index.js';

const PLUGIN_ID = 'jeeves-meta-openclaw';
const ROOT = process.cwd();

const manifest = JSON.parse(readFileSync('openclaw.plugin.json', 'utf-8')) as {
  contracts: { tools: string[] };
};

function setup(config?: Record<string, unknown>) {
  const tools = new Map<string, ToolDescriptor>();
  const warn = vi.fn();
  const api: PluginApi = {
    config: { plugins: { entries: { [PLUGIN_ID]: { config } } } },
    resolvePath: () => ROOT,
    logger: { warn },
    registerTool: (tool) => {
      tools.set(tool.name, tool);
    },
  };
  return { api, tools, warn };
}

describe('register', () => {
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

  it('succeeds with no config, registers every tool and warns once', () => {
    const { api, tools, warn } = setup();
    expect(() => {
      register(api);
    }).not.toThrow();
    expect([...tools.keys()].sort()).toEqual(
      [...manifest.contracts.tools].sort(),
    );
    expect(warn).toHaveBeenCalledExactlyOnceWith(CONFIG_ROOT_WARNING);
  });

  it('meta_service without configRoot returns a clear error', async () => {
    const { api, tools } = setup();
    register(api);
    const result = await tools
      .get('meta_service')!
      .execute('id', { action: 'status' });
    const text = JSON.stringify(result);
    expect(text).toContain('configRoot not configured');
    expect(text).toContain(`plugins.entries.${PLUGIN_ID}.config.configRoot`);
    expect(text).toContain('JEEVES_CONFIG_ROOT');
  });

  it('meta_service reaches the core tool with plugin config', async () => {
    const { api, tools, warn } = setup({ configRoot: ROOT });
    register(api);
    expect(warn).not.toHaveBeenCalled();
    const result = await tools
      .get('meta_service')!
      .execute('id', { action: 'bogus' });
    expect(JSON.stringify(result)).toContain('Invalid action: bogus');
  });

  it('meta_service reaches the core tool with JEEVES_CONFIG_ROOT', async () => {
    process.env['JEEVES_CONFIG_ROOT'] = ROOT;
    const { api, tools, warn } = setup();
    register(api);
    expect(warn).not.toHaveBeenCalled();
    const result = await tools
      .get('meta_service')!
      .execute('id', { action: 'bogus' });
    expect(JSON.stringify(result)).toContain('Invalid action: bogus');
  });

  it('declares exactly the conversation hooks it registers (none)', async () => {
    const hooks = await recordRegisteredHooks(register, {
      logger: { warn: () => {} },
    });
    const pkg: unknown = JSON.parse(readFileSync('package.json', 'utf-8'));
    expect(validateConversationHooks(pkg, hooks)).toEqual([]);
  });
});
