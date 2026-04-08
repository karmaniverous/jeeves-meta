import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import {
  formatProgressEvent,
  type ProgressEvent,
  ProgressReporter,
} from './index.js';

function createLogger() {
  return {
    warn: vi.fn(),
  } as unknown as Logger;
}

describe('formatProgressEvent', () => {
  it('formats synthesis_start with directory path', () => {
    const e: ProgressEvent = { type: 'synthesis_start', path: 'x' };
    expect(formatProgressEvent(e)).toBe('🔬 Started meta synthesis: x');
  });

  it('formats phase_start', () => {
    const e: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/github/org',
      phase: 'architect',
    };
    expect(formatProgressEvent(e)).toBe('  ⚙️ Architect phase started');
  });

  it('formats phase_complete', () => {
    const e: ProgressEvent = {
      type: 'phase_complete',
      path: 'j:/domains/github/org',
      phase: 'builder',
      tokens: 1234,
      durationMs: 1500,
    };
    expect(formatProgressEvent(e)).toBe(
      '  ✅ Builder complete (1,234 tokens / 2s)',
    );
  });

  it('formats synthesis_complete', () => {
    const e: ProgressEvent = {
      type: 'synthesis_complete',
      path: 'x',
      tokens: 10,
      durationMs: 2500,
    };
    expect(formatProgressEvent(e)).toBe(
      '✅ Completed: x/.meta/meta.json (10 tokens / 3s)',
    );
  });

  it('formats error with directory path', () => {
    const e: ProgressEvent = {
      type: 'error',
      path: 'x',
      phase: 'critic',
      error: 'boom',
    };
    expect(formatProgressEvent(e)).toBe(
      '❌ Synthesis failed at Critic phase: x\n   Error: boom',
    );
  });

  it('constructs directory link in synthesis_start when serverBaseUrl is set', () => {
    const e: ProgressEvent = {
      type: 'synthesis_start',
      path: 'D:\\domains\\github\\org',
    };
    const result = formatProgressEvent(e, 'http://localhost:1938');
    expect(result).toContain('http://localhost:1938/path/D/domains/github/org');
    expect(result).not.toContain('meta.json');
  });

  it('constructs meta.json link in synthesis_complete when serverBaseUrl is set', () => {
    const e: ProgressEvent = {
      type: 'synthesis_complete',
      path: 'j:/domains/github/org',
      tokens: 100,
      durationMs: 5000,
    };
    const result = formatProgressEvent(e, 'https://meta.example.com');
    expect(result).toContain(
      'https://meta.example.com/path/j/domains/github/org/.meta/meta.json',
    );
  });

  it('uses plain directory path when serverBaseUrl is not set', () => {
    const e: ProgressEvent = { type: 'synthesis_start', path: 'x' };
    const result = formatProgressEvent(e);
    expect(result).toBe('🔬 Started meta synthesis: x');
  });

  it('URL-encodes path segments with special characters', () => {
    const e: ProgressEvent = {
      type: 'synthesis_start',
      path: 'j:/domains/slack/dm-Bob Louthan (D123)',
    };
    const result = formatProgressEvent(e, 'http://localhost:1934');
    expect(result).toContain(
      'http://localhost:1934/path/j/domains/slack/dm-Bob%20Louthan%20(D123)',
    );
  });

  it('URL-encodes meta.json link in synthesis_complete', () => {
    const e: ProgressEvent = {
      type: 'synthesis_complete',
      path: 'j:/domains/slack/dm-Bob Louthan (D123)',
      tokens: 50,
      durationMs: 1000,
    };
    const result = formatProgressEvent(e, 'http://localhost:1934');
    expect(result).toContain(
      'http://localhost:1934/path/j/domains/slack/dm-Bob%20Louthan%20(D123)/.meta/meta.json',
    );
  });

  it('renders "unknown tokens" when tokens is undefined in phase_complete', () => {
    const e: ProgressEvent = {
      type: 'phase_complete',
      path: 'x',
      phase: 'builder',
      durationMs: 1000,
    };
    expect(formatProgressEvent(e)).toBe(
      '  ✅ Builder complete (unknown tokens / 1s)',
    );
  });

  it('renders "unknown tokens" when tokens is undefined in synthesis_complete', () => {
    const e: ProgressEvent = {
      type: 'synthesis_complete',
      path: 'x',
      durationMs: 2000,
    };
    expect(formatProgressEvent(e)).toBe(
      '✅ Completed: x/.meta/meta.json (unknown tokens / 2s)',
    );
  });
});

describe('ProgressReporter', () => {
  it('is a no-op when reportChannel is not set', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      { gatewayUrl: 'http://127.0.0.1:18789' },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 200 })),
      );

    await reporter.report({ type: 'synthesis_start', path: 'x' });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('posts to gateway /tools/invoke with message tool', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        gatewayApiKey: 'k',
        reportChannel: 'C123',
      },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        const rawBody = init?.body;
        if (typeof rawBody !== 'string') {
          throw new Error('Expected request body to be a string');
        }
        const body = JSON.parse(rawBody) as {
          tool: string;
          args: { action: string; target: string; message: string };
        };

        expect(body.tool).toBe('message');
        expect(body.args.action).toBe('send');
        expect(body.args.target).toBe('C123');
        expect(body.args.message).toContain('Started meta synthesis');

        return Promise.resolve(new Response('', { status: 200 }));
      });

    await reporter.report({ type: 'synthesis_start', path: 'x' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('sends channel field when both reportChannel and reportTarget are set', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        reportChannel: 'slack',
        reportTarget: 'C456',
      },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        const rawBody = init?.body;
        if (typeof rawBody !== 'string') {
          throw new Error('Expected request body to be a string');
        }
        const body = JSON.parse(rawBody) as {
          tool: string;
          args: {
            action: string;
            target: string;
            message: string;
            channel?: string;
          };
        };

        expect(body.args.target).toBe('C456');
        expect(body.args.channel).toBe('slack');

        return Promise.resolve(new Response('', { status: 200 }));
      });

    await reporter.report({ type: 'synthesis_start', path: 'x' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('omits channel field in legacy single-channel mode', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        reportChannel: 'C123',
      },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((_input, init) => {
        const rawBody = init?.body;
        if (typeof rawBody !== 'string') {
          throw new Error('Expected request body to be a string');
        }
        const body = JSON.parse(rawBody) as {
          tool: string;
          args: {
            action: string;
            target: string;
            message: string;
            channel?: string;
          };
        };

        expect(body.args.target).toBe('C123');
        expect(body.args.channel).toBeUndefined();

        return Promise.resolve(new Response('', { status: 200 }));
      });

    await reporter.report({ type: 'synthesis_start', path: 'x' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('logs warning on gateway error and does not throw', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      { gatewayUrl: 'http://127.0.0.1:18789', reportChannel: 'C123' },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('nope', { status: 500 })),
      );

    await expect(
      reporter.report({ type: 'synthesis_start', path: 'x' }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
