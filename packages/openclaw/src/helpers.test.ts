/**
 * Tests for helper utilities.
 *
 * @module helpers.test
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  getConfigRoot,
  getServiceUrl,
  type PluginApi,
  resolvePluginSetting,
} from './helpers.js';

function makeApi(config?: Record<string, unknown>): PluginApi {
  return {
    config: {
      plugins: {
        entries: {
          'jeeves-meta-openclaw': { config },
        },
      },
    },
    registerTool: () => {},
  } as unknown as PluginApi;
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
      resolvePluginSetting(api, 'myKey', 'TEST_RESOLVE_VAR', 'default'),
    ).toBe('from-plugin');
  });

  it('falls back to env var when plugin config is absent', () => {
    const api = makeApi({});
    process.env['TEST_RESOLVE_VAR'] = 'from-env';
    expect(
      resolvePluginSetting(api, 'myKey', 'TEST_RESOLVE_VAR', 'default'),
    ).toBe('from-env');
  });

  it('falls back to default when both are absent', () => {
    const api = makeApi({});
    delete process.env['TEST_RESOLVE_VAR'];
    expect(
      resolvePluginSetting(api, 'myKey', 'TEST_RESOLVE_VAR', 'default'),
    ).toBe('default');
  });

  it('prefers plugin config over env var', () => {
    const api = makeApi({ myKey: 'from-plugin' });
    process.env['TEST_RESOLVE_VAR'] = 'from-env';
    expect(
      resolvePluginSetting(api, 'myKey', 'TEST_RESOLVE_VAR', 'default'),
    ).toBe('from-plugin');
  });
});

describe('getConfigRoot', () => {
  it('delegates with correct default', () => {
    const api = makeApi({});
    delete process.env['JEEVES_CONFIG_ROOT'];
    expect(getConfigRoot(api)).toBe('j:/config');
  });
});

describe('getServiceUrl', () => {
  it('delegates with correct default', () => {
    const api = makeApi({});
    delete process.env['JEEVES_META_URL'];
    expect(getServiceUrl(api)).toBe('http://127.0.0.1:1938');
  });
});
