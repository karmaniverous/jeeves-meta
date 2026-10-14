/**
 * Tests for progress reporting when jeeves-server refuses resolve-path:
 * links are omitted (never raw paths) and the cause is logged once.
 *
 * @module progress/progressAuth.test
 */

import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgressReporter, type ProgressReporterConfig } from './index.js';

const OWNER_PATH = 'j:/domains/github/org';

function createLogger() {
  return { warn: vi.fn(), info: vi.fn() } as unknown as Logger & {
    warn: ReturnType<typeof vi.fn>;
  };
}

/**
 * Mock fetch: resolve-path answers with `status`; gateway calls succeed and
 * their messages are captured.
 */
function mockServer(status: number): string[] {
  const messages: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('/api/resolve-path'))
      return Promise.resolve(new Response('denied', { status }));
    const rawBody = init?.body;
    if (typeof rawBody !== 'string') throw new Error('Expected a string body');
    const body = JSON.parse(rawBody) as { args: { message: string } };
    messages.push(body.args.message);
    return Promise.resolve(new Response('', { status: 200 }));
  });
  return messages;
}

function makeReporter(
  overrides: Partial<ProgressReporterConfig>,
  logger: Logger,
): ProgressReporter {
  return new ProgressReporter(
    {
      gatewayUrl: 'http://127.0.0.1:18789',
      reportTarget: 'C123',
      serverUrl: 'http://127.0.0.1:1934',
      ...overrides,
    },
    logger,
  );
}

describe('ProgressReporter with jeeves-server auth failures', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('omits links instead of emitting raw paths on 401', async () => {
    const messages = mockServer(401);
    const reporter = makeReporter({ serverKey: 'bad' }, createLogger());

    await reporter.report({
      type: 'phase_start',
      path: OWNER_PATH,
      phase: 'architect',
    });
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

  it('warns once, naming a rejected key', async () => {
    mockServer(403);
    const logger = createLogger();
    const reporter = makeReporter({ serverKey: 'bad' }, logger);

    for (let i = 0; i < 3; i++)
      await reporter.report({
        type: 'phase_start',
        path: OWNER_PATH,
        phase: 'architect',
      });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403 }),
      expect.stringContaining('rejected serverKey'),
    );
  });

  it('warns once, naming a missing key', async () => {
    mockServer(401);
    const logger = createLogger();
    const reporter = makeReporter({}, logger);

    await reporter.report({
      type: 'phase_start',
      path: OWNER_PATH,
      phase: 'architect',
    });
    await reporter.report({
      type: 'phase_start',
      path: OWNER_PATH,
      phase: 'architect',
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 }),
      expect.stringContaining('set serverKey'),
    );
  });

  it('picks up a hot-reloaded serverKey on the next report', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response('', { status: 404 }));
    });
    const config: ProgressReporterConfig = {
      gatewayUrl: 'http://127.0.0.1:18789',
      reportTarget: 'C123',
    };
    const reporter = new ProgressReporter(config, createLogger());

    config.serverKey = 'test-seed';
    await reporter.report({
      type: 'phase_start',
      path: OWNER_PATH,
      phase: 'architect',
    });

    const resolveUrl = urls.find((u) => u.includes('/api/resolve-path'));
    expect(new URL(resolveUrl ?? '').searchParams.get('k')).toBe(
      '21efb54b51cb607b79cd48a386d4ed7b',
    );
  });
});
