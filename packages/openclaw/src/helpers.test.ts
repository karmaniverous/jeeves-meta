/**
 * Tests for helper utilities.
 *
 * @module helpers.test
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getConfigRoot, getServiceUrl, type PluginApi } from './helpers.js';

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

describe('getConfigRoot', () => {
  const originalEnv = process.env['JEEVES_CONFIG_ROOT'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['JEEVES_CONFIG_ROOT'];
    } else {
      process.env['JEEVES_CONFIG_ROOT'] = originalEnv;
    }
  });

  it('returns configRoot from plugin config', () => {
    const api = makeApi({ configRoot: '/custom/config' });
    expect(getConfigRoot(api)).toBe('/custom/config');
  });

  it('falls back to JEEVES_CONFIG_ROOT env var', () => {
    const api = makeApi({});
    process.env['JEEVES_CONFIG_ROOT'] = '/env/config';
    expect(getConfigRoot(api)).toBe('/env/config');
  });

  it('defaults to j:/config', () => {
    const api = makeApi({});
    delete process.env['JEEVES_CONFIG_ROOT'];
    expect(getConfigRoot(api)).toBe('j:/config');
  });

  it('prefers plugin config over env var', () => {
    const api = makeApi({ configRoot: '/plugin/config' });
    process.env['JEEVES_CONFIG_ROOT'] = '/env/config';
    expect(getConfigRoot(api)).toBe('/plugin/config');
  });
});

describe('getServiceUrl', () => {
  const originalEnv = process.env['JEEVES_META_URL'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['JEEVES_META_URL'];
    } else {
      process.env['JEEVES_META_URL'] = originalEnv;
    }
  });

  it('returns serviceUrl from plugin config', () => {
    const api = makeApi({ serviceUrl: 'http://custom:9999' });
    expect(getServiceUrl(api)).toBe('http://custom:9999');
  });

  it('falls back to JEEVES_META_URL env var', () => {
    const api = makeApi({});
    process.env['JEEVES_META_URL'] = 'http://env:8888';
    expect(getServiceUrl(api)).toBe('http://env:8888');
  });

  it('defaults to http://127.0.0.1:1938', () => {
    const api = makeApi({});
    delete process.env['JEEVES_META_URL'];
    expect(getServiceUrl(api)).toBe('http://127.0.0.1:1938');
  });
});
