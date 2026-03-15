/**
 * Tests for HttpWatcherClient.
 *
 * @module watcher-client/HttpWatcherClient.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpWatcherClient } from './HttpWatcherClient.js';

// Mock global fetch
const mockFetch = vi.fn();

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HttpWatcherClient.registerRules', () => {
  it('sends POST /rules/register', async () => {
    const client = new HttpWatcherClient({ baseUrl: 'http://localhost:1936' });
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await client.registerRules('jeeves-meta', [
      {
        name: 'meta-current',
        description: 'test',
        match: {},
        schema: ['base'],
      },
    ]);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1936/rules/register');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.source).toBe('jeeves-meta');
    expect(body.rules).toHaveLength(1);
  });
});

describe('HttpWatcherClient.walk', () => {
  it('sends POST /walk with globs and returns paths', async () => {
    const client = new HttpWatcherClient({ baseUrl: 'http://localhost:1936' });
    const responseData = {
      paths: [
        'j:/domains/email/.meta/meta.json',
        'j:/domains/github/.meta/meta.json',
      ],
      matchedCount: 2,
      scannedRoots: ['j:/domains'],
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(responseData));

    const result = await client.walk(['**/.meta/meta.json']);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:1936/walk');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.globs).toEqual(['**/.meta/meta.json']);
    expect(result).toEqual(responseData.paths);
  });

  it('returns empty array when no paths match', async () => {
    const client = new HttpWatcherClient({ baseUrl: 'http://localhost:1936' });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ paths: [], matchedCount: 0 }),
    );

    const result = await client.walk(['**/.nonexistent']);
    expect(result).toEqual([]);
  });

  it('retries on 500 with exponential backoff', async () => {
    const client = new HttpWatcherClient({
      baseUrl: 'http://localhost:1936',
      backoffBaseMs: 1,
      backoffFactor: 1,
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Internal' }, 500))
      .mockResolvedValueOnce(jsonResponse({ paths: [] }));

    const result = await client.walk(['**/*']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual([]);
  });

  it('throws immediately on 400 (non-transient)', async () => {
    const client = new HttpWatcherClient({ baseUrl: 'http://localhost:1936' });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Bad Request' }, 400),
    );

    await expect(client.walk(['**/*'])).rejects.toThrow('HTTP 400');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries', async () => {
    const client = new HttpWatcherClient({
      baseUrl: 'http://localhost:1936',
      maxRetries: 2,
      backoffBaseMs: 1,
      backoffFactor: 1,
    });
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Internal' }, 500));

    await expect(client.walk(['**/*'])).rejects.toThrow('HTTP 500');
    // Initial + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on 429 (rate limited)', async () => {
    const client = new HttpWatcherClient({
      baseUrl: 'http://localhost:1936',
      backoffBaseMs: 1,
      backoffFactor: 1,
    });
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({ paths: ['a.txt'] }));

    const result = await client.walk(['**/*']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(['a.txt']);
  });
});
