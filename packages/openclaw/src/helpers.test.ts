/**
 * Tests for helper utilities.
 *
 * @module helpers.test
 */

import { type PluginApi, resolvePluginSetting } from '@karmaniverous/jeeves';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CONFIG_ROOT_MISSING_MESSAGE,
  getServiceUrl,
  resolveConfigRoot,
} from './helpers.js';

const PLUGIN_ID = 'jeeves-meta-openclaw';

function makeApi(config?: Record<string, unknown>): PluginApi {
  return {
    config: {
      plugins: {
        entries: {
          [PLUGIN_ID]: { config },
        },
      },
    },
    registerTool: () => {},
  };
}

describe('resolvePluginSetting', () => {
  const originalEnv = process.env['TEST_RESOLVE_VAR'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['TEST_RESOLVE_VAR'];
    } else {
      process.env['TEST_RESOLVE_VAR'] = originalEnv;
    }
  });

  it('returns plugin config value first', () => {
    const api = makeApi({ myKey: 'from-plugin' });
    expect(
      resolvePluginSetting(
        api,
        PLUGIN_ID,
        'myKey',
        'TEST_RESOLVE_VAR',
        'default',
      ),
    ).toBe('from-plugin');
  });

  it('falls back to env var when plugin config is absent', () => {
    const api = makeApi({});
    process.env['TEST_RESOLVE_VAR'] = 'from-env';
    expect(
      resolvePluginSetting(
        api,
        PLUGIN_ID,
        'myKey',
        'TEST_RESOLVE_VAR',
        'default',
      ),
    ).toBe('from-env');
  });

  it('falls back to default when both are absent', () => {
    const api = makeApi({});
    delete process.env['TEST_RESOLVE_VAR'];
    expect(
      resolvePluginSetting(
        api,
        PLUGIN_ID,
        'myKey',
        'TEST_RESOLVE_VAR',
        'default',
      ),
    ).toBe('default');
  });

  it('prefers plugin config over env var', () => {
    const api = makeApi({ myKey: 'from-plugin' });
    process.env['TEST_RESOLVE_VAR'] = 'from-env';
    expect(
      resolvePluginSetting(
        api,
        PLUGIN_ID,
        'myKey',
        'TEST_RESOLVE_VAR',
        'default',
      ),
    ).toBe('from-plugin');
  });
});

describe('resolveConfigRoot', () => {
  const originalEnv = process.env['JEEVES_CONFIG_ROOT'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['JEEVES_CONFIG_ROOT'];
    } else {
      process.env['JEEVES_CONFIG_ROOT'] = originalEnv;
    }
  });

  it('returns plugin entry config value when set', () => {
    const api = makeApi({ configRoot: '/custom/config' });
    expect(resolveConfigRoot(api)).toBe('/custom/config');
  });

  it('prefers api.pluginConfig over plugin entry config and env', () => {
    process.env['JEEVES_CONFIG_ROOT'] = '/env/config';
    const api: PluginApi = {
      ...makeApi({ configRoot: '/entry/config' }),
      pluginConfig: { configRoot: '/own/config' },
    };
    expect(resolveConfigRoot(api)).toBe('/own/config');
  });

  it('returns env var when plugin config absent', () => {
    const api = makeApi({});
    process.env['JEEVES_CONFIG_ROOT'] = '/env/config';
    expect(resolveConfigRoot(api)).toBe('/env/config');
  });

  it('returns undefined (does not throw) when neither is set', () => {
    const api = makeApi({});
    delete process.env['JEEVES_CONFIG_ROOT'];
    expect(resolveConfigRoot(api)).toBeUndefined();
  });

  it('ignores an empty pluginConfig value', () => {
    delete process.env['JEEVES_CONFIG_ROOT'];
    const api: PluginApi = { ...makeApi({}), pluginConfig: { configRoot: '' } };
    expect(resolveConfigRoot(api)).toBeUndefined();
  });
});

describe('CONFIG_ROOT_MISSING_MESSAGE', () => {
  it('names both ways to set configRoot', () => {
    expect(CONFIG_ROOT_MISSING_MESSAGE).toContain('configRoot not configured');
    expect(CONFIG_ROOT_MISSING_MESSAGE).toContain(
      `plugins.entries.${PLUGIN_ID}.config.configRoot`,
    );
    expect(CONFIG_ROOT_MISSING_MESSAGE).toContain('JEEVES_CONFIG_ROOT');
  });
});

describe('getServiceUrl', () => {
  it('delegates with correct default', () => {
    const api = makeApi({});
    delete process.env['JEEVES_META_URL'];
    expect(getServiceUrl(api)).toBe('http://127.0.0.1:1938');
  });
});
