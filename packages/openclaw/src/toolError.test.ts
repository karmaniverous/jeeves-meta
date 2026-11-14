/**
 * @module toolError.test
 * Tool results for failed calls (spec 4.4.7), through real tools over a
 * stubbed `fetch`: a non-2xx reply reads `HTTP {status}: {body}` with the
 * body as received, an unreachable service gets the connection guidance,
 * and a timeout, an invalid reply or a non-SDK error reads
 * `Error: {message}`.
 */

import { MetaError } from '@karmaniverous/jeeves-meta-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCustomTools } from './customTools.js';
import { toolError } from './toolError.js';

const BASE = 'http://127.0.0.1:1938';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The text of a tool result. */
function text(result: unknown): string {
  return (result as { content: Array<{ text: string }> }).content[0].text;
}

/** Run a custom tool with `fetch` answering `reply`. */
async function run(
  name: string,
  params: Record<string, unknown>,
  reply: () => Promise<Response>,
) {
  vi.stubGlobal('fetch', vi.fn(reply));
  const tool = buildCustomTools(BASE).find((t) => t.name === name);
  return tool!.execute('id', params);
}

describe('custom tool errors', () => {
  it('renders a meta error as HTTP <status>: <body>', async () => {
    const body = JSON.stringify({
      statusCode: 404,
      code: 'META_NOT_FOUND',
      error: 'Not Found',
      message: 'Meta path not found: j:/x',
    });
    const result = await run('meta_detail', { path: 'j:/x' }, () =>
      Promise.resolve(
        new Response(body, {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    expect(text(result)).toBe(`Error: HTTP 404: ${body}`);
  });

  it('gives connection guidance when the service is unreachable', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      }),
    });
    const result = await run('meta_list', {}, () => Promise.reject(refused));
    expect(text(result)).toContain(BASE);
    expect(text(result)).not.toMatch(/^Error: HTTP/);
  });

  it('reads Error: <message> for a reply that breaks its schema', async () => {
    const result = await run('meta_queue', { action: 'clear' }, () =>
      Promise.resolve(Response.json({ cleared: 'x' })),
    );
    expect(text(result)).toMatch(/^Error: /);
    expect(text(result)).not.toContain('HTTP');
  });
});

describe('toolError', () => {
  it('reads Error: <message> for a timeout and a non-SDK error', () => {
    const timeout = new MetaError({
      code: 'timeout',
      status: 0,
      message: 'queue timed out after 20 ms',
    });
    expect(text(toolError(timeout, BASE))).toBe(
      'Error: queue timed out after 20 ms',
    );
    expect(text(toolError(new Error('boom'), BASE))).toBe('Error: boom');
  });
});
