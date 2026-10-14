/**
 * Tests for progress reporting when jeeves-server refuses resolve-path:
 * no raw path reaches any template and each cause is logged once.
 *
 * @module progress/progressAuth.test
 */

import { pino } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  type ProgressEvent,
  ProgressReporter,
  type ProgressReporterConfig,
} from './index.js';

const OWNER_PATH = 'j:/domains/github/org';

const gatewayBodySchema = z.object({ args: z.object({ message: z.string() }) });

/** A real silent Pino logger with a spy on `warn`. */
function createLogger() {
  const logger = pino({ level: 'silent' });
  const warn = vi.spyOn(logger, 'warn');
  return { logger, warn };
}

/**
 * Mock fetch: resolve-path answers with the next status from `statuses`
 * (the last one repeats); gateway calls succeed and their messages are
 * captured.
 */
function mockServer(...statuses: number[]): string[] {
  const messages: string[] = [];
  let call = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/api/resolve-path')) {
      const status = statuses[Math.min(call++, statuses.length - 1)] ?? 401;
      return Promise.resolve(new Response('denied', { status }));
    }
    const rawBody = init?.body;
    if (typeof rawBody !== 'string') throw new Error('Expected a string body');
    messages.push(gatewayBodySchema.parse(JSON.parse(rawBody)).args.message);
    return Promise.resolve(new Response('', { status: 200 }));
  });
  return messages;
}

function makeConfig(
  overrides: Partial<ProgressReporterConfig> = {},
): ProgressReporterConfig {
  return {
    gatewayUrl: 'http://127.0.0.1:18789',
    reportTarget: 'C123',
    serverUrl: 'http://127.0.0.1:1934',
    ...overrides,
  };
}

const start: ProgressEvent = {
  type: 'phase_start',
  path: OWNER_PATH,
  phase: 'architect',
};

describe('ProgressReporter with jeeves-server auth failures', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('omits links instead of emitting raw paths on 401', async () => {
    const messages = mockServer(401);
    const { logger } = createLogger();
    const reporter = new ProgressReporter(
      makeConfig({ serverKey: 'bad' }),
      logger,
    );

    await reporter.report(start);
    await reporter.report({
      type: 'phase_complete',
      path: OWNER_PATH,
      phase: 'builder',
      tokens: 10,
      durationMs: 1000,
    });
    await reporter.report({
      type: 'error',
      path: OWNER_PATH,
      phase: 'critic',
      error: 'boom',
    });

    expect(messages).toEqual([
      ':gear: Started meta synthesis ARCHITECT phase',
      ':white_check_mark: Completed meta synthesis BUILDER phase (10 tokens / 1s)',
      ':x: Meta synthesis CRITIC phase failed\n   Error: boom',
    ]);
    for (const m of messages) expect(m).not.toContain(OWNER_PATH);
  });

  it('blanks dirPath and metaPath for custom templates on 403', async () => {
    const messages = mockServer(403);
    const { logger } = createLogger();
    const reporter = new ProgressReporter(
      makeConfig({
        serverKey: 'bad',
        templates: { phaseStart: 'start [{{dirPath}}] [{{metaPath}}]' },
      }),
      logger,
    );

    await reporter.report(start);

    expect(messages).toEqual(['start [] []']);
  });

  it('keeps dirPath and metaPath when the lookup only falls back', async () => {
    const messages = mockServer(404);
    const { logger } = createLogger();
    const reporter = new ProgressReporter(
      makeConfig({ templates: { phaseStart: '{{dirPath}} {{metaPath}}' } }),
      logger,
    );

    await reporter.report(start);

    expect(messages).toEqual([`${OWNER_PATH} ${OWNER_PATH}/.meta/meta.json`]);
  });

  it('warns once per cause across alternating 401/403 responses', async () => {
    mockServer(401, 403, 401, 403);
    const { logger, warn } = createLogger();
    const reporter = new ProgressReporter(
      makeConfig({ serverKey: 'bad' }),
      logger,
    );

    for (let i = 0; i < 4; i++) await reporter.report(start);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('rejected serverKey'),
    );
  });

  it('warns once per cause across missing -> rejected -> missing', async () => {
    mockServer(401);
    const { logger, warn } = createLogger();
    const config = makeConfig();
    const reporter = new ProgressReporter(config, logger);

    await reporter.report(start);
    config.serverKey = 'bad';
    await reporter.report(start);
    delete config.serverKey;
    await reporter.report(start);
    config.serverKey = 'worse';
    await reporter.report(start);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('set serverKey'),
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('rejected serverKey'),
    );
  });

  it('picks up a hot-reloaded serverKey on the next report', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    const config = makeConfig();
    const { logger } = createLogger();
    const reporter = new ProgressReporter(config, logger);

    config.serverKey = 'test-seed';
    await reporter.report(start);

    const resolveUrl = urls.find((u) => u.includes('/api/resolve-path'));
    expect(new URL(resolveUrl ?? '').searchParams.get('k')).toBe(
      '21efb54b51cb607b79cd48a386d4ed7b',
    );
  });
});
