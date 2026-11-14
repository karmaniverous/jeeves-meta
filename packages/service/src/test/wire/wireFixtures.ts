/**
 * @module test/wire/wireFixtures
 * The wire baseline's fixture corpus: `.meta/` owners written to a temp
 * directory, and the helpers that reset, walk and trim it. Writes files;
 * no network.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { normalizePath } from '../../normalizePath.js';

/** Fixture owner directories, relative to the fixture root. */
export const FIXTURE_OWNERS = {
  /** Recently synthesized, no error. */
  fresh: 'alpha',
  /** Synthesized long ago. */
  stale: 'alpha-stale',
  /** Last synthesis recorded an error. */
  error: 'alpha-error',
  /** `_disabled: true`. */
  disabled: 'alpha-disabled',
  /** Has an active (non-stale) `.lock` file. */
  locked: 'alpha-locked',
  /** `_crossRefs` to `fresh` (resolved) and a missing path. */
  crossref: 'alpha-crossref',
  /** Owner path containing a space. */
  spaced: 'sub dir with space/leaf',
  /** Owner path containing a literal `%`. */
  percent: 'pct%off',
  /** Fully synthesized — every phase fresh, owes nothing. */
  complete: 'alpha-complete',
  /** No `.meta/` yet — target for the seed-success scenario. */
  seedTarget: 'new-owner',
} as const;

const ISO_OLD = '2020-01-01T00:00:00.000Z';

/** Write one fixture owner's `.meta/meta.json` (and optional `.lock`). */
function writeOwner(
  dir: string,
  owner: string,
  meta: Record<string, unknown>,
  lock?: Record<string, unknown>,
): void {
  const metaDir = join(dir, owner, '.meta');
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(
    join(metaDir, 'meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
  );
  if (lock) {
    writeFileSync(join(metaDir, '.lock'), JSON.stringify(lock, null, 2) + '\n');
  }
}

/** Write the fixture corpus (every owner but `seedTarget`) under `dir`. */
export function writeFixtures(dir: string): void {
  const nowRecent = new Date(Date.now() - 60_000).toISOString();

  writeOwner(dir, FIXTURE_OWNERS.fresh, {
    _id: '11111111-1111-1111-1111-111111111111',
    _generatedAt: nowRecent,
    _architectTokens: 100,
    _builderTokens: 200,
    _criticTokens: 50,
  });
  writeOwner(dir, FIXTURE_OWNERS.stale, {
    _id: '22222222-2222-2222-2222-222222222222',
    _generatedAt: ISO_OLD,
  });
  writeOwner(dir, FIXTURE_OWNERS.error, {
    _id: '33333333-3333-3333-3333-333333333333',
    _generatedAt: nowRecent,
    _error: {
      step: 'builder',
      message: 'timeout',
      timestamp: nowRecent,
    },
  });
  writeOwner(dir, FIXTURE_OWNERS.disabled, {
    _id: '44444444-4444-4444-4444-444444444444',
    _generatedAt: nowRecent,
    _disabled: true,
  });
  writeOwner(
    dir,
    FIXTURE_OWNERS.locked,
    {
      _id: '55555555-5555-5555-5555-555555555555',
      _generatedAt: nowRecent,
    },
    { _lockPid: 999999, _lockStartedAt: new Date().toISOString() },
  );
  writeOwner(dir, FIXTURE_OWNERS.crossref, {
    _id: '66666666-6666-6666-6666-666666666666',
    _generatedAt: nowRecent,
    _crossRefs: [
      normalizePath(join(dir, FIXTURE_OWNERS.fresh)),
      normalizePath(join(dir, 'does-not-exist')),
    ],
  });
  writeOwner(dir, FIXTURE_OWNERS.spaced, {
    _id: '77777777-7777-7777-7777-777777777777',
    _generatedAt: nowRecent,
  });
  writeOwner(dir, FIXTURE_OWNERS.percent, {
    _id: '88888888-8888-8888-8888-888888888888',
    _generatedAt: nowRecent,
  });
  writeOwner(dir, FIXTURE_OWNERS.complete, {
    _id: '99999999-9999-9999-9999-999999999999',
    _generatedAt: nowRecent,
    _content: 'synthesis done',
    _builder: 'build brief',
    // sha256 of an empty scope: the owner has no files besides .meta/.
    _structureHash:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    _synthesisCount: 1,
    _phaseState: { architect: 'fresh', builder: 'fresh', critic: 'fresh' },
    _architectTokens: 10,
    _builderTokens: 20,
    _criticTokens: 5,
  });
}

/** Remove every fixture owner under `dir`, including `seedTarget`. */
export function clearFixtures(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      rmSync(join(dir, entry.name), {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    }
  }
}

/** Recursively find every `.meta/meta.json` file under `root`. */
export function walkFixtures(root: string): string[] {
  const out: string[] = [];
  const visit = (dirPath: string): void => {
    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.meta') {
          const metaJson = join(full, 'meta.json');
          if (existsSync(metaJson)) out.push(normalizePath(metaJson));
        } else {
          visit(full);
        }
      }
    }
  };
  visit(root);
  return out;
}

/**
 * Remove every fixture owner's `meta.json` except `keep`, so a corpus-wide
 * request sees exactly one candidate.
 *
 * @param dir - The fixture root.
 * @param keep - The owner to keep.
 */
export function keepOnly(dir: string, keep: keyof typeof FIXTURE_OWNERS): void {
  for (const [key, owner] of Object.entries(FIXTURE_OWNERS)) {
    const metaJson = join(dir, owner, '.meta', 'meta.json');
    if (key !== keep && existsSync(metaJson)) unlinkSync(metaJson);
  }
}
