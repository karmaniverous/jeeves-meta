/**
 * Tests that the request schemas, moved from the service to core, accept
 * and refuse exactly what 0.19.0 did (spec 4.4.1), including the query
 * flags rewritten to fit the catalog rules.
 *
 * @module catalog/requests.test
 */

import { describe, expect, it } from 'vitest';

import {
  metaDetailQuerySchema,
  metasQuerySchema,
  updateBodySchema,
} from './requests.js';

describe('metasQuerySchema', () => {
  it('parses flags and staleHours from strings', () => {
    expect(
      metasQuerySchema.parse({
        hasError: 'true',
        locked: 'false',
        staleHours: '2.5',
      }),
    ).toEqual({ hasError: true, locked: false, staleHours: 2.5 });
  });

  it.each([
    { hasError: 'yes' },
    { staleHours: 'abc' },
    { staleHours: '0' },
    { disabled: '1' },
  ])('refuses %o', (query) => {
    expect(metasQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('metaDetailQuerySchema includeArchive', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['3', 3],
    ['0', 0],
  ] as const)('reads %s as %s', (value, expected) => {
    expect(
      metaDetailQuerySchema.parse({ includeArchive: value }).includeArchive,
    ).toBe(expected);
  });

  it.each(['foo', '-1', '1.5'])('refuses %s', (value) => {
    expect(
      metaDetailQuerySchema.safeParse({ includeArchive: value }).success,
    ).toBe(false);
  });
});

describe('updateBodySchema', () => {
  it('accepts user-settable keys and null removals', () => {
    const body = { _steer: null, _emphasis: 2, _crossRefs: ['a'] };
    expect(updateBodySchema.parse(body)).toEqual(body);
  });

  it.each([{ unknownKey: true }, { _content: 'x' }, { _emphasis: -1 }])(
    'refuses %o (strict)',
    (body) => {
      expect(updateBodySchema.safeParse(body).success).toBe(false);
    },
  );
});
