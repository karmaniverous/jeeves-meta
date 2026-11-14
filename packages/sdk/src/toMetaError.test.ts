/**
 * @module toMetaError.test
 * Error mapping (Decision 186): responses keep their HTTP status, their body's code (else `http_<status>`) and message, and the body; client-side failures get the SDK codes with status 0.
 */

import { CatalogClientError } from '@karmaniverous/jeeves/catalog';
import { describe, expect, it } from 'vitest';

import { MetaError } from './MetaError.js';
import { toMetaError } from './toMetaError.js';

type Details = ConstructorParameters<typeof CatalogClientError>[1];

/** A catalog client error; `issues` loosely typed for brevity. */
const clientError = ({
  message,
  issues,
  ...details
}: Omit<Details, 'issues'> & { message: string; issues?: unknown[] }) =>
  new CatalogClientError(message, {
    ...details,
    ...(issues === undefined ? {} : { issues: issues as Details['issues'] }),
  });

describe('toMetaError', () => {
  it.each([
    [404, 'META_NOT_FOUND', 'Not Found', 'Meta path not found: j:/x'],
    [
      409,
      'META_NOT_LOCKED',
      'Conflict',
      'No lock file at j:/x (already unlocked)',
    ],
    [
      503,
      'META_WATCHER_UNAVAILABLE',
      'Service Unavailable',
      'Watcher unreachable — cannot list metas',
    ],
  ])(
    "keeps HTTP %i, the body's code %s and its message",
    (status, code, error, message) => {
      const body = { statusCode: status, code, error, message };
      const err = toMetaError(
        clientError({ message: 'x', status, body }),
        'metaDetail',
        1000,
        JSON.stringify(body),
      );
      expect(err).toBeInstanceOf(MetaError);
      expect(err).toMatchObject({
        code,
        status,
        body,
        responseText: JSON.stringify(body),
        message,
      });
    },
  );

  it('falls back to http_<status> for a body without a code (a masked 500)', () => {
    const body = {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'The server could not complete the request.',
    };
    const err = toMetaError(
      clientError({ message: 'x', status: 500, body }),
      'listMetas',
      1000,
    );
    expect(err).toMatchObject({
      code: 'http_500',
      status: 500,
      message: 'The server could not complete the request.',
    });
  });

  it('treats an empty code and message as absent, falling back to the status text', () => {
    const err = toMetaError(
      clientError({
        message: 'x',
        status: 418,
        body: { statusCode: 418, code: '', error: 'Teapot', message: '' },
      }),
      'status',
      1000,
    );
    expect(err).toMatchObject({ code: 'http_418', message: 'Teapot' });
  });

  it('names a non-2xx without a body', () => {
    const err = toMetaError(
      clientError({ message: 'x', status: 502 }),
      'status',
      1000,
    );
    expect(err).toMatchObject({ code: 'http_502', status: 502 });
    expect(err.message).toBe('HTTP 502');
    expect(err).not.toHaveProperty('responseText', expect.anything());
  });

  it('maps request-schema issues (nothing sent) to invalid_request', () => {
    const err = toMetaError(
      clientError({
        message: 'Invalid input for "seed"',
        status: 0,
        issues: [{ path: ['path'] }],
      }),
      'seed',
      1000,
    );
    expect(err).toMatchObject({
      code: 'invalid_request',
      status: 0,
      issues: [{ path: ['path'] }],
      message: 'Invalid input for "seed"',
    });
  });

  it('maps response-schema issues to invalid_response with the status', () => {
    const err = toMetaError(
      clientError({ message: 'x', status: 200, issues: [] }),
      'listMetas',
      1000,
    );
    expect(err).toMatchObject({ code: 'invalid_response', status: 200 });
  });

  it('maps an aborted call to timeout, naming the timeout', () => {
    const cause = new DOMException('aborted', 'TimeoutError');
    const err = toMetaError(
      clientError({ message: 'x', status: 0, cause }),
      'preview',
      120_000,
    );
    expect(err).toMatchObject({ code: 'timeout', status: 0 });
    expect(err.message).toBe('preview timed out after 120000 ms');
  });

  it('maps a non-JSON 2xx to invalid_response', () => {
    const err = toMetaError(
      clientError({
        message: 'x',
        status: 200,
        cause: new SyntaxError('Unexpected token'),
      }),
      'status',
      1000,
    );
    expect(err).toMatchObject({ code: 'invalid_response', status: 200 });
  });

  it('maps a fetch failure to network_error, keeping the cause', () => {
    const cause = new TypeError('fetch failed');
    const wrapped = clientError({ message: 'x', status: 0, cause });
    const err = toMetaError(wrapped, 'status', 1000);
    expect(err).toMatchObject({ code: 'network_error', status: 0 });
    expect(err.message).toBe('status request failed: fetch failed');
    expect(err.cause).toBe(wrapped);
  });

  it('maps anything else thrown to network_error', () => {
    const err = toMetaError('boom', 'status', 1000);
    expect(err).toMatchObject({
      code: 'network_error',
      status: 0,
      message: 'status request failed: boom',
    });
  });
});
