/**
 * Tests for createMeta shared seed logic.
 *
 * @module seed/createMeta.test
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMeta, metaExists } from './createMeta.js';

let testRoot: string;

beforeEach(() => {
  testRoot = join(
    tmpdir(),
    `jeeves-seed-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('createMeta', () => {
  it('creates .meta/ directory and meta.json with _id', async () => {
    const ownerPath = join(testRoot, 'project');
    const result = await createMeta(ownerPath);

    const metaJsonPath = join(ownerPath, '.meta', 'meta.json');
    expect(existsSync(metaJsonPath)).toBe(true);
    expect(result.metaDir).toBe(join(ownerPath, '.meta'));
    expect(result._id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const meta = JSON.parse(readFileSync(metaJsonPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta._id).toBe(result._id);
  });

  it('includes crossRefs when provided', async () => {
    const ownerPath = join(testRoot, 'with-refs');
    await createMeta(ownerPath, {
      crossRefs: ['j:/path/a', 'j:/path/b'],
    });

    const metaJsonPath = join(ownerPath, '.meta', 'meta.json');
    const meta = JSON.parse(readFileSync(metaJsonPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta._crossRefs).toEqual(['j:/path/a', 'j:/path/b']);
  });

  it('includes steer when provided', async () => {
    const ownerPath = join(testRoot, 'with-steer');
    await createMeta(ownerPath, { steer: 'Focus on API changes' });

    const metaJsonPath = join(ownerPath, '.meta', 'meta.json');
    const meta = JSON.parse(readFileSync(metaJsonPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta._steer).toBe('Focus on API changes');
  });

  it('omits crossRefs and steer when not provided', async () => {
    const ownerPath = join(testRoot, 'minimal');
    await createMeta(ownerPath);

    const metaJsonPath = join(ownerPath, '.meta', 'meta.json');
    const meta = JSON.parse(readFileSync(metaJsonPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(meta).not.toHaveProperty('_crossRefs');
    expect(meta).not.toHaveProperty('_steer');
  });
});

describe('metaExists', () => {
  it('returns false when .meta/ does not exist', () => {
    expect(metaExists(join(testRoot, 'nonexistent'))).toBe(false);
  });

  it('returns true after createMeta', async () => {
    const ownerPath = join(testRoot, 'exists');
    await createMeta(ownerPath);
    expect(metaExists(ownerPath)).toBe(true);
  });
});
