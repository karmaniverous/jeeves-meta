/**
 * @module readme.test
 * The README usage example, compiled by `tsc` and run against a stub
 * service, so the documented calls, types and error handling stay true.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createMetaClient,
  isMetaError,
  type MetaInput,
  type MetaResponse,
} from './index.js';

const SUMMARY = {
  total: 1,
  stale: 0,
  errors: 1,
  locked: 0,
  disabled: 0,
  neverSynthesized: 0,
  tokens: { architect: 0, builder: 0, critic: 0 },
  stalestPath: null,
  lastSynthesizedPath: null,
  lastSynthesizedAt: null,
};

const DETAIL = {
  path: 'j:/domains/projects/x/.meta',
  meta: {},
  scope: { ownedFiles: 0, childMetas: 0, totalFiles: 0 },
  staleness: { seconds: null, score: 0 },
  phaseState: null,
  owedPhase: 'architect',
};

/** Stub service: a list, a detail, then a 503 for synthesize. */
const reply = (url: string) => {
  if (url.includes('/metas?'))
    return Response.json({ summary: SUMMARY, metas: [] });
  if (url.includes('/metas/')) return Response.json(DETAIL);
  return Response.json(
    {
      statusCode: 503,
      code: 'META_WATCHER_UNAVAILABLE',
      error: 'Service Unavailable',
      message: 'Watcher unreachable — cannot discover candidates',
    },
    { status: 503 },
  );
};

describe('README usage', () => {
  it('runs as documented', async () => {
    const log = vi.fn();
    const meta = createMetaClient({
      baseUrl: 'http://127.0.0.1:1938',
      fetch: (url) => Promise.resolve(reply(url)),
    });

    // --- README example ---
    const { summary } = await meta.listMetas({ hasError: 'true' });
    const detail = await meta.metaDetail({ path: 'j:/domains/projects/x' });

    try {
      const queued = await meta.synthesize({ path: 'j:/domains/projects/x' });
      log(queued.status, summary.errors, detail.owedPhase);
    } catch (error) {
      if (isMetaError(error) && error.code === 'META_WATCHER_UNAVAILABLE') {
        log(`${error.message} (HTTP ${String(error.status)})`);
      } else throw error;
    }
    // --- end ---

    expect(summary.errors).toBe(1);
    expect(detail.owedPhase).toBe('architect');
    expect(log).toHaveBeenCalledWith(
      'Watcher unreachable — cannot discover candidates (HTTP 503)',
    );
  });

  it('documents per-call timeouts and the exported types', async () => {
    const queued = {
      status: 'queued',
      path: 'j:/x/.meta',
      owedPhase: 'builder',
      queuePosition: 0,
      alreadyQueued: false,
    } as const;
    const meta = createMetaClient({
      baseUrl: 'http://x',
      fetch: () => Promise.resolve(Response.json(queued, { status: 202 })),
    });
    const input: MetaInput<'synthesize'> = { path: 'j:/x' };
    const body: MetaResponse<'synthesize'> = await meta.synthesize(input, {
      timeoutMs: 10_000,
    });
    expect(body).toEqual(queued);
  });
});
