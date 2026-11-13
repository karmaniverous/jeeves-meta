import { describe, expect, it } from 'vitest';

import { finiteOrNull } from './finiteOrNull.js';

describe('finiteOrNull', () => {
  it.each([
    [0, 0],
    [42.5, 42.5],
    [-1, -1],
    [Infinity, null],
    [-Infinity, null],
    [NaN, null],
  ])('%s -> %s', (value, expected) => {
    expect(finiteOrNull(value)).toBe(expected);
  });
});
