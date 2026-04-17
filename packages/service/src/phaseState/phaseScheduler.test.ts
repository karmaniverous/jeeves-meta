import { describe, expect, it } from 'vitest';

import type { MetaEntry } from '../discovery/listMetas.js';
import type { MetaNode } from '../discovery/types.js';
import type { MetaJson, PhaseState } from '../schema/meta.js';
import {
  buildPhaseCandidates,
  rankPhaseCandidates,
  selectPhaseCandidate,
} from './phaseScheduler.js';

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

  it('mid-cycle builder beats staler architect (finish started work first)', () => {
    const metas = [
      candidate(
        'stale-arch/.meta',
        { architect: 'pending', builder: 'stale', critic: 'stale' },
        { actualStaleness: 100000 },
      ),
      candidate(
        'mid-build/.meta',
        { architect: 'fresh', builder: 'pending', critic: 'stale' },
        { actualStaleness: 1000 },
      ),
    ];

    const result = selectPhaseCandidate(metas, 1);
    // Builder (band 2) beats architect (band 3) regardless of staleness
    expect(result!.node.metaPath).toBe('mid-build/.meta');
    expect(result!.band).toBe(2);
    expect(result!.midCycle).toBe(true);
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

  it('treeDepth with depthWeight influences tiebreak', () => {
    const metas = [
      candidate(
        'shallow/.meta',
        { architect: 'fresh', builder: 'fresh', critic: 'pending' },
        { actualStaleness: 1000, treeDepth: 0 },
      ),
      candidate(
        'deep/.meta',
        { architect: 'fresh', builder: 'fresh', critic: 'pending' },
        { actualStaleness: 1000, treeDepth: 5 },
      ),
    ];

    // With depthWeight = 0, same staleness → order depends on effective staleness calc
    const noWeight = selectPhaseCandidate(metas, 0);
    expect(noWeight).not.toBeNull();

    // With depthWeight > 0, deeper node should get boosted staleness
    const withWeight = selectPhaseCandidate(metas, 2);
    expect(withWeight).not.toBeNull();
    expect(withWeight!.node.metaPath).toBe('deep/.meta');
  });
});

describe('buildPhaseCandidates', () => {
  function makeEntry(
    metaPath: string,
    meta: MetaJson,
    opts: {
      locked?: boolean;
      disabled?: boolean;
      stalenessSeconds?: number;
      treeDepth?: number;
    } = {},
  ): MetaEntry {
    return {
      path: metaPath,
      depth: opts.treeDepth ?? 0,
      emphasis: 1,
      stalenessSeconds: opts.stalenessSeconds ?? 3600,
      lastSynthesized: null,
      hasError: false,
      locked: opts.locked ?? false,
      disabled: opts.disabled ?? false,
      architectTokens: null,
      builderTokens: null,
      criticTokens: null,
      children: 0,
      node: makeNode(metaPath, opts.treeDepth ?? 0),
      meta,
    };
  }

  it('derives phase state from meta fields', () => {
    const entries: MetaEntry[] = [
      makeEntry('a/.meta', {}), // never-synthesized → architect pending
    ];
    const candidates = buildPhaseCandidates(entries);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].phaseState.architect).toBe('pending');
    expect(candidates[0].phaseState.builder).toBe('stale');
  });

  it('auto-retries failed phases', () => {
    const entries: MetaEntry[] = [
      makeEntry('a/.meta', {
        _phaseState: {
          architect: 'fresh',
          builder: 'failed',
          critic: 'stale',
        },
      }),
    ];
    const candidates = buildPhaseCandidates(entries);
    expect(candidates[0].phaseState.builder).toBe('pending');
  });

  it('maps staleness, locked, and disabled from entry', () => {
    const entries: MetaEntry[] = [
      makeEntry(
        'a/.meta',
        { _builder: 'b', _content: 'c', _feedback: 'f' },
        { locked: true, disabled: true, stalenessSeconds: 9999 },
      ),
    ];
    const candidates = buildPhaseCandidates(entries);
    expect(candidates[0].locked).toBe(true);
    expect(candidates[0].disabled).toBe(true);
    expect(candidates[0].actualStaleness).toBe(9999);
  });
});

describe('rankPhaseCandidates', () => {
  it('returns full sorted list, not just the first', () => {
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

    const ranked = rankPhaseCandidates(metas, 1);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].owedPhase).toBe('critic');
    expect(ranked[0].band).toBe(1);
    expect(ranked[1].owedPhase).toBe('builder');
    expect(ranked[1].band).toBe(2);
    expect(ranked[2].owedPhase).toBe('architect');
    expect(ranked[2].band).toBe(3);
  });

  it('sorts within band by effective staleness descending', () => {
    const metas = [
      candidate(
        'a/.meta',
        { architect: 'fresh', builder: 'fresh', critic: 'pending' },
        { actualStaleness: 100 },
      ),
      candidate(
        'b/.meta',
        { architect: 'fresh', builder: 'fresh', critic: 'pending' },
        { actualStaleness: 5000 },
      ),
      candidate(
        'c/.meta',
        { architect: 'fresh', builder: 'fresh', critic: 'pending' },
        { actualStaleness: 2000 },
      ),
    ];

    const ranked = rankPhaseCandidates(metas, 0);
    expect(ranked[0].node.metaPath).toBe('b/.meta');
    expect(ranked[1].node.metaPath).toBe('c/.meta');
    expect(ranked[2].node.metaPath).toBe('a/.meta');
  });

  it('returns empty array when all candidates are ineligible', () => {
    const metas = [
      candidate('a/.meta', {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'fresh',
      }),
    ];
    const ranked = rankPhaseCandidates(metas, 1);
    expect(ranked).toEqual([]);
  });
});
