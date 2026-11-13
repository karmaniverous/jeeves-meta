/**
 * @module MetaError.test
 * The SDK error: fields kept from its init, and the type guard.
 */

import { describe, expect, it } from 'vitest';

import { errorBodyText, isMetaError, MetaError } from './MetaError.js';

describe('MetaError', () => {
  it('keeps code, status, body, text, issues and cause', () => {
    const cause = new Error('inner');
    const body = {
      statusCode: 409,
      code: 'META_MAX_CONCURRENCY',
      error: 'Conflict',
      message: 'busy',
    };
    const err = new MetaError({
      code: 'META_MAX_CONCURRENCY',
      status: 409,
      message: 'busy',
      body,
      responseText: JSON.stringify(body),
      issues: [],
      cause,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      name: 'MetaError',
      code: 'META_MAX_CONCURRENCY',
      status: 409,
      message: 'busy',
      body,
      responseText: JSON.stringify(body),
      issues: [],
    });
    expect(err.cause).toBe(cause);
  });

  it('has no cause unless given one', () => {
    const err = new MetaError({ code: 'timeout', status: 0, message: 't' });
    expect('cause' in err).toBe(false);
  });
});

describe('errorBodyText', () => {
  const http = (extra: object) =>
    new MetaError({ code: 'http_502', status: 502, message: 'x', ...extra });

  it('is the body as received when captured, even empty', () => {
    expect(errorBodyText(http({ responseText: 'Bad Gateway' }))).toBe(
      'Bad Gateway',
    );
    const body = { statusCode: 502, error: 'Bad Gateway', message: '' };
    expect(errorBodyText(http({ responseText: '', body }))).toBe('');
  });

  it('falls back to the parsed body, or {}', () => {
    const body = { statusCode: 502, error: 'Bad Gateway', message: 'e' };
    expect(errorBodyText(http({ body }))).toBe(JSON.stringify(body));
    expect(errorBodyText(http({}))).toBe('{}');
  });
});

describe('isMetaError', () => {
  it('tells a MetaError from other errors and values', () => {
    expect(
      isMetaError(new MetaError({ code: 'timeout', status: 0, message: 't' })),
    ).toBe(true);
    expect(isMetaError(new Error('x'))).toBe(false);
    expect(isMetaError({ code: 'timeout', status: 0 })).toBe(false);
  });
});
