/**
 * Tests for mtime filter utilities.
 *
 * @module mtimeFilter.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { filterModifiedAfter, hasModifiedAfter } from './mtimeFilter.js';
import { normalizePath } from './normalizePath.js';

const testDir = join(tmpdir(), `mtime-test-${Date.now().toString()}`);
const fileA = normalizePath(join(testDir, 'a.txt'));
const fileB = normalizePath(join(testDir, 'b.txt'));

beforeAll(() => {
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, 'a.txt'), 'a');
  writeFileSync(join(testDir, 'b.txt'), 'b');
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('hasModifiedAfter', () => {
  it('returns true when a file was modified after the timestamp', () => {
    // Files were just created — mtime is "now", far after year 2000
    expect(hasModifiedAfter([fileA], new Date('2000-01-01').getTime())).toBe(
      true,
    );
  });

  it('returns false when no files were modified after the timestamp', () => {
    // Future timestamp — nothing can be newer
    expect(hasModifiedAfter([fileA], new Date('2099-01-01').getTime())).toBe(
      false,
    );
  });

  it('returns false for empty file list', () => {
    expect(hasModifiedAfter([], new Date('2000-01-01').getTime())).toBe(false);
  });

  it('skips unreadable files without throwing', () => {
    expect(
      hasModifiedAfter(
        ['/nonexistent/path.txt', fileA],
        new Date('2000-01-01').getTime(),
      ),
    ).toBe(true);
  });

  it('returns false when all files are unreadable', () => {
    expect(
      hasModifiedAfter(
        ['/nonexistent/a.txt', '/nonexistent/b.txt'],
        new Date('2000-01-01').getTime(),
      ),
    ).toBe(false);
  });
});

describe('filterModifiedAfter', () => {
  it('returns files modified after the timestamp', () => {
    const result = filterModifiedAfter(
      [fileA, fileB],
      new Date('2000-01-01').getTime(),
    );
    expect(result).toContain(fileA);
    expect(result).toContain(fileB);
  });

  it('returns empty array when none modified after timestamp', () => {
    const result = filterModifiedAfter(
      [fileA, fileB],
      new Date('2099-01-01').getTime(),
    );
    expect(result).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterModifiedAfter([], new Date('2000-01-01').getTime())).toEqual(
      [],
    );
  });

  it('excludes unreadable files', () => {
    const result = filterModifiedAfter(
      ['/nonexistent/path.txt', fileA],
      new Date('2000-01-01').getTime(),
    );
    expect(result).toEqual([fileA]);
  });
});
