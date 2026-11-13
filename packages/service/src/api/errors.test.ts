/**
 * @module api/errors.test
 * `capArg`: caller-supplied message arguments are capped, by code points,
 * with an ellipsis marking a cut.
 */

import { describe, expect, it } from 'vitest';

import { capArg, MESSAGE_ARG_MAX } from './errors.js';

describe('capArg', () => {
  it('keeps an argument up to the cap', () => {
    const exact = 'a'.repeat(MESSAGE_ARG_MAX);
    expect(capArg(exact)).toBe(exact);
  });

  it('cuts a longer one to the cap, ending in an ellipsis', () => {
    const capped = capArg('é'.repeat(MESSAGE_ARG_MAX + 5));
    expect(Array.from(capped)).toHaveLength(MESSAGE_ARG_MAX);
    expect(capped.endsWith('é…')).toBe(true);
  });

  it('counts code points, not UTF-16 units', () => {
    const emoji = '😀'.repeat(MESSAGE_ARG_MAX);
    expect(capArg(emoji)).toBe(emoji);
  });
});
