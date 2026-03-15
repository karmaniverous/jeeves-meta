/**
 * Tests for readMetaJson utility.
 *
 * @module readMetaJson.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readMetaJson } from './readMetaJson.js';

const testDir = join(tmpdir(), `readmeta-test-${Date.now().toString()}`);
const metaDir = join(testDir, '.meta');

beforeAll(() => {
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(
    join(metaDir, 'meta.json'),
    JSON.stringify({ _id: 'test-id', _content: '# Hello' }),
  );
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('readMetaJson', () => {
  it('reads and parses meta.json from a .meta/ directory', () => {
    const meta = readMetaJson(metaDir);
    expect(meta._id).toBe('test-id');
    expect(meta._content).toBe('# Hello');
  });

  it('throws when meta.json does not exist', () => {
    expect(() => readMetaJson('/nonexistent/.meta')).toThrow();
  });

  it('throws when meta.json contains invalid JSON', () => {
    const badDir = join(testDir, 'bad-meta');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'meta.json'), 'not json');
    expect(() => readMetaJson(badDir)).toThrow();
  });
});
