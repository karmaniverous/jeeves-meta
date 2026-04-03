/**
 * Tests for customCliCommands utility functions.
 *
 * @module customCliCommands.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PORT_STR } from './constants.js';

// Mock getServiceUrl to return a known base URL without requiring init()
vi.mock('@karmaniverous/jeeves', () => ({
  fetchJson: vi.fn(),
  postJson: vi.fn(),
  getServiceUrl: () => 'http://127.0.0.1:1938',
}));

const { apiUrl } = await import('./customCliCommands.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('apiUrl', () => {
  it('builds URL from default port and simple path', () => {
    const result = apiUrl(DEFAULT_PORT_STR, '/metas');
    expect(result).toBe('http://127.0.0.1:1938/metas');
  });

  it('overrides port when non-default port is provided', () => {
    const result = apiUrl('2000', '/metas');
    expect(result).toBe('http://127.0.0.1:2000/metas');
  });

  it('handles path with encoded segment', () => {
    const encoded = encodeURIComponent('j:/domains/email/.meta');
    const result = apiUrl(DEFAULT_PORT_STR, `/metas/${encoded}`);
    const url = new URL(result);
    expect(url.pathname).toContain('/metas/');
    expect(url.port).toBe('1938');
  });

  it('handles path with query string', () => {
    const result = apiUrl(DEFAULT_PORT_STR, '/preview?path=test');
    const url = new URL(result);
    expect(url.pathname).toBe('/preview');
    expect(url.searchParams.get('path')).toBe('test');
  });

  it('preserves default port when port matches DEFAULT_PORT_STR', () => {
    const result = apiUrl(DEFAULT_PORT_STR, '/status');
    const url = new URL(result);
    expect(url.port).toBe('1938');
  });

  it('handles root path', () => {
    const result = apiUrl(DEFAULT_PORT_STR, '/');
    expect(result).toBe('http://127.0.0.1:1938/');
  });
});
