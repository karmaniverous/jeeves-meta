import Handlebars from 'handlebars';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TEMPLATE_STRINGS } from '../schema/config.js';
import {
  type ProgressEvent,
  ProgressReporter,
  type ProgressReporterConfig,
  renderProgressEvent,
} from './index.js';

function makeCompiledTemplates(overrides?: {
  phaseStart?: string;
  phaseEnd?: string;
  phaseError?: string;
}) {
  return {
    phaseStart: Handlebars.compile(
      overrides?.phaseStart ?? DEFAULT_TEMPLATE_STRINGS.phaseStart,
    ),
    phaseEnd: Handlebars.compile(
      overrides?.phaseEnd ?? DEFAULT_TEMPLATE_STRINGS.phaseEnd,
    ),
    phaseError: Handlebars.compile(
      overrides?.phaseError ?? DEFAULT_TEMPLATE_STRINGS.phaseError,
    ),
  };
}

function createLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
  } as unknown as Logger;
}

/** Extract the URL string from a fetch input argument. */
function getInputUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Mock fetch to return a 404 so resolveLink falls back to raw paths. */
function mockFetchNotFound() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(new Response('not found', { status: 404 })),
    );
}

describe('renderProgressEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders phase_start with ARCHITECT and dirLink fallback', async () => {
    mockFetchNotFound();
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/github/org',
      phase: 'architect',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toBe(
      ':gear: Started meta synthesis ARCHITECT phase of <j:/domains/github/org>',
    );
  });

  it('renders phase_complete with formatted tokens and seconds', async () => {
    mockFetchNotFound();
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_complete',
      path: 'j:/domains/github/org',
      phase: 'builder',
      tokens: 38200,
      durationMs: 4500,
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toContain('BUILDER');
    expect(result).toContain('38,200');
    expect(result).toContain('5s');
  });

  it('renders phase_complete with "unknown" tokens when undefined', async () => {
    mockFetchNotFound();
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_complete',
      path: 'j:/domains/github/org',
      phase: 'builder',
      durationMs: 1000,
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toContain('unknown');
  });

  it('renders error with CRITIC and dirLink fallback', async () => {
    mockFetchNotFound();
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'error',
      path: 'j:/domains/github/org',
      phase: 'critic',
      error: 'boom',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toBe(
      ':x: Meta synthesis CRITIC phase failed at <j:/domains/github/org>\n   Error: boom',
    );
  });

  it('uses publicUrl from resolve-path API when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            browsePath: 'j/domains/github/org',
            browseUrl: '/browse/j/domains/github/org',
            publicUrl: 'https://jeeves.example.com/browse/j/domains/github/org',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/github/org',
      phase: 'architect',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toContain(
      'https://jeeves.example.com/browse/j/domains/github/org',
    );
  });

  it('uses browseUrl + serverUrl when publicUrl is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            browsePath: 'j/domains/github/org',
            browseUrl: '/browse/j/domains/github/org',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/github/org',
      phase: 'architect',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toContain(
      'http://127.0.0.1:1934/browse/j/domains/github/org',
    );
  });

  it('falls back to raw path when resolve-path API is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('connection refused')),
    );
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/github/org',
      phase: 'architect',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toContain('j:/domains/github/org');
    expect(result).not.toContain('http://127.0.0.1:1934/browse');
  });

  it('metaLink appends /.meta/meta.json to the resolved dirLink', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            browsePath: 'j/domains/github/org',
            browseUrl: '/browse/j/domains/github/org',
            publicUrl: 'https://jeeves.example.com/browse/j/domains/github/org',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_complete',
      path: 'j:/domains/github/org',
      phase: 'critic',
      tokens: 100,
      durationMs: 2000,
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toContain(
      'https://jeeves.example.com/browse/j/domains/github/org/.meta/meta.json',
    );
  });

  it('renders phase_start with custom template', async () => {
    mockFetchNotFound();
    const templates = makeCompiledTemplates({
      phaseStart: 'CUSTOM: {{phase}} → {{dirPath}}',
    });
    const event: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/mydir',
      phase: 'builder',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toBe('CUSTOM: BUILDER → j:/domains/mydir');
  });

  it('exposes dirPath and metaPath as raw paths in template data', async () => {
    mockFetchNotFound();
    const templates = makeCompiledTemplates({
      phaseStart: '{{dirPath}} | {{metaPath}}',
    });
    const event: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/mydir',
      phase: 'architect',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toBe('j:/domains/mydir | j:/domains/mydir/.meta/meta.json');
  });

  it('renders UNKNOWN phase when event.phase is undefined', async () => {
    mockFetchNotFound();
    const templates = makeCompiledTemplates();
    const event: ProgressEvent = {
      type: 'phase_start',
      path: 'j:/domains/mydir',
    };
    const result = await renderProgressEvent(
      event,
      templates,
      'http://127.0.0.1:1934',
    );
    expect(result).toContain('UNKNOWN');
  });
});

describe('ProgressReporter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is a no-op when neither reportChannel nor reportTarget is set', async () => {
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

    await reporter.report({
      type: 'phase_start',
      path: 'x',
      phase: 'architect',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to gateway /tools/invoke with message tool', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        gatewayApiKey: 'k',
        reportChannel: 'C123',
        serverUrl: 'http://127.0.0.1:1934',
      },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        // First call is the resolve-path API; subsequent call is the gateway invoke
        const url = getInputUrl(input);
        if (url.includes('resolve-path')) {
          return Promise.resolve(new Response('not found', { status: 404 }));
        }
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
        expect(body.args.message).toContain('ARCHITECT');

        return Promise.resolve(new Response('', { status: 200 }));
      });

    await reporter.report({
      type: 'phase_start',
      path: 'x',
      phase: 'architect',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2); // resolve-path + gateway
  });

  it('sends channel field when both reportChannel and reportTarget are set', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        reportChannel: 'slack',
        reportTarget: 'C456',
        serverUrl: 'http://127.0.0.1:1934',
      },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = getInputUrl(input);
        if (url.includes('resolve-path')) {
          return Promise.resolve(new Response('not found', { status: 404 }));
        }
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

    await reporter.report({ type: 'phase_start', path: 'x', phase: 'builder' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('omits channel field in legacy single-channel mode', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        reportChannel: 'C123',
        serverUrl: 'http://127.0.0.1:1934',
      },
      logger,
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = getInputUrl(input);
        if (url.includes('resolve-path')) {
          return Promise.resolve(new Response('not found', { status: 404 }));
        }
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

    await reporter.report({ type: 'phase_start', path: 'x', phase: 'critic' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('logs warning on gateway error and does not throw', async () => {
    const logger = createLogger();
    const reporter = new ProgressReporter(
      {
        gatewayUrl: 'http://127.0.0.1:18789',
        reportChannel: 'C123',
        serverUrl: 'http://127.0.0.1:1934',
      },
      logger,
    );

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = getInputUrl(input);
      if (url.includes('resolve-path')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(new Response('nope', { status: 500 }));
    });

    await expect(
      reporter.report({ type: 'phase_start', path: 'x', phase: 'architect' }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
  });

  it('recompiles templates when config.templates is mutated (hot-reload)', async () => {
    const config: ProgressReporterConfig = {
      gatewayUrl: 'http://127.0.0.1:18789',
      reportChannel: 'C123',
      serverUrl: 'http://127.0.0.1:1934',
      templates: { ...DEFAULT_TEMPLATE_STRINGS },
    };
    const logger = createLogger();
    const reporter = new ProgressReporter(config, logger);

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = getInputUrl(input);
      if (url.includes('resolve-path')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(new Response('', { status: 200 }));
    });

    // Mutate config.templates (simulates applyHotReloadedConfig)
    config.templates!.phaseStart = 'HOT_RELOADED: {{phase}}';

    await reporter.report({
      type: 'phase_start',
      path: 'x',
      phase: 'architect',
    });

    // Verify the hot-reloaded template was used
    const gatewayCall = vi
      .mocked(globalThis.fetch)
      .mock.calls.find((c) => getInputUrl(c[0]).includes('tools/invoke'));
    expect(gatewayCall).toBeDefined();
    const body = JSON.parse(gatewayCall![1]?.body as string) as {
      args: { message: string };
    };
    expect(body.args.message).toBe('HOT_RELOADED: ARCHITECT');

    // Verify recompilation was logged
    expect(logger.info).toHaveBeenCalledWith(
      'Progress templates recompiled (hot-reload)',
    );
  });
});
