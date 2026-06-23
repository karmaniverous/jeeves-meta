/**
 * Tests for helper utilities.
 *
 * @module helpers.test
 */

import { type PluginApi, resolvePluginSetting } from '@karmaniverous/jeeves';
import { afterEach, describe, expect, it } from 'vitest';

import { getConfigRoot, getServiceUrl } from './helpers.js';

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

describe('getConfigRoot', () => {
  const originalEnv = process.env['JEEVES_CONFIG_ROOT'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['JEEVES_CONFIG_ROOT'];
    } else {
      process.env['JEEVES_CONFIG_ROOT'] = originalEnv;
    }
  });

  it('returns plugin config value when set', () => {
    const api = makeApi({ configRoot: '/custom/config' });
    expect(getConfigRoot(api)).toBe('/custom/config');
  });

  it('returns env var when plugin config absent', () => {
    const api = makeApi({});
    process.env['JEEVES_CONFIG_ROOT'] = '/env/config';
    expect(getConfigRoot(api)).toBe('/env/config');
  });

  it('throws when neither plugin config nor env var is set', () => {
    const api = makeApi({});
    delete process.env['JEEVES_CONFIG_ROOT'];
    expect(() => getConfigRoot(api)).toThrow('configRoot not configured');
  });
});

describe('getServiceUrl', () => {
  it('delegates with correct default', () => {
    const api = makeApi({});
    delete process.env['JEEVES_META_URL'];
    expect(getServiceUrl(api)).toBe('http://127.0.0.1:1938');
  });
});
