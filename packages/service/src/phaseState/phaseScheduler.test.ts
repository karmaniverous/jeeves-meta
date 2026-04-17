import { describe, expect, it } from 'vitest';

import type { MetaNode } from '../discovery/types.js';
import type { MetaJson, PhaseState } from '../schema/meta.js';
import { selectPhaseCandidate } from './phaseScheduler.js';

/** Helper to create a minimal MetaNode stub. */
function makeNode(metaPath: string, treeDepth = 0): MetaNode {
  return {
    metaPath,
    ownerPath: metaPath.replace(/\/.meta$/, ''),
    treeDepth,
    children: [],
    parent: null,
  };
}

/** Helper to create a minimal MetaJson stub. */
function makeMeta(overrides: Partial<MetaJson> = {}): MetaJson {
  return {
    _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
    ...overrides,
  };
}

/** Helper to build a candidate entry. */
function candidate(
  path: string,
  phaseState: PhaseState,
  opts: {
    actualStaleness?: number;
    locked?: boolean;
    disabled?: boolean;
    isOverride?: boolean;
    treeDepth?: number;
    meta?: Partial<MetaJson>;
  } = {},
) {
  return {
    node: makeNode(path, opts.treeDepth ?? 0),
    meta: makeMeta(opts.meta),
    phaseState,
    actualStaleness: opts.actualStaleness ?? 3600,
    locked: opts.locked ?? false,
    disabled: opts.disabled ?? false,
    isOverride: opts.isOverride,
  };
}

describe('selectPhaseCandidate', () => {
  it('returns null for empty input', () => {
    expect(selectPhaseCandidate([], 1)).toBeNull();
  });

  it('returns null when all metas are fully fresh', () => {
    const result = selectPhaseCandidate(
      [
        candidate('a/.meta', {
          architect: 'fresh',
          builder: 'fresh',
          critic: 'fresh',
        }),
      ],
      1,
    );
    expect(result).toBeNull();
  });

  it('returns null when all candidates are locked', () => {
    const result = selectPhaseCandidate(
      [
        candidate(
          'a/.meta',
          { architect: 'pending', builder: 'stale', critic: 'stale' },
          { locked: true },
        ),
      ],
      1,
    );
    expect(result).toBeNull();
  });

  it('excludes disabled metas unless override', () => {
    const result = selectPhaseCandidate(
      [
        candidate(
          'a/.meta',
          { architect: 'pending', builder: 'stale', critic: 'stale' },
          { disabled: true },
        ),
      ],
      1,
    );
    expect(result).toBeNull();

    const withOverride = selectPhaseCandidate(
      [
        candidate(
          'a/.meta',
          { architect: 'pending', builder: 'stale', critic: 'stale' },
          { disabled: true, isOverride: true },
        ),
      ],
      1,
    );
    expect(withOverride).not.toBeNull();
    expect(withOverride!.owedPhase).toBe('architect');
  });

  it('skips phases in stale state (not yet pending)', () => {
    // Builder is stale (not pending) — architect is fresh, so builder is first
    // non-fresh, but stale is not scheduler-eligible
    const result = selectPhaseCandidate(
      [
        candidate('a/.meta', {
          architect: 'fresh',
          builder: 'stale',
          critic: 'stale',
        }),
      ],
      1,
    );
    expect(result).toBeNull();
  });

  it('picks pending critic over pending builder over pending architect', () => {
    const metas = [
      candidate('arch/.meta', {
        architect: 'pending',
        builder: 'stale',
        critic: 'stale',
      }),
      candidate('build/.meta', {
        architect: 'fresh',
        builder: 'pending',
        critic: 'stale',
      }),
      candidate('crit/.meta', {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'pending',
      }),
    ];

    const result = selectPhaseCandidate(metas, 1);
    expect(result).not.toBeNull();
    expect(result!.node.metaPath).toBe('crit/.meta');
    expect(result!.owedPhase).toBe('critic');
    expect(result!.band).toBe(1);
  });

  it('picks builder over architect when no critic is pending', () => {
    const metas = [
      candidate('arch/.meta', {
        architect: 'pending',
        builder: 'stale',
        critic: 'stale',
      }),
      candidate('build/.meta', {
        architect: 'fresh',
        builder: 'pending',
        critic: 'stale',
      }),
    ];

    const result = selectPhaseCandidate(metas, 1);
    expect(result!.node.metaPath).toBe('build/.meta');
    expect(result!.owedPhase).toBe('builder');
    expect(result!.band).toBe(2);
  });

  it('breaks ties within band by effective staleness (higher wins)', () => {
    const metas = [
      candidate(
        'a/.meta',
        { architect: 'fresh', builder: 'fresh', critic: 'pending' },
        { actualStaleness: 1000 },
      ),
      candidate(
        'b/.meta',
        { architect: 'fresh', builder: 'fresh', critic: 'pending' },
        { actualStaleness: 5000 },
      ),
    ];

    const result = selectPhaseCandidate(metas, 1);
    expect(result!.node.metaPath).toBe('b/.meta');
  });

  it('failed phase is not scheduler-eligible', () => {
    const result = selectPhaseCandidate(
      [
        candidate('a/.meta', {
          architect: 'fresh',
          builder: 'failed',
          critic: 'stale',
        }),
      ],
      1,
    );
    expect(result).toBeNull();
  });

  it('running phase is not scheduler-eligible', () => {
    const result = selectPhaseCandidate(
      [
        candidate('a/.meta', {
          architect: 'fresh',
          builder: 'running',
          critic: 'stale',
        }),
      ],
      1,
    );
    expect(result).toBeNull();
  });

  it('returns correct band and owedPhase', () => {
    const result = selectPhaseCandidate(
      [
        candidate('a/.meta', {
          architect: 'pending',
          builder: 'stale',
          critic: 'stale',
        }),
      ],
      1,
    );
    expect(result!.owedPhase).toBe('architect');
    expect(result!.band).toBe(3);
  });
});
