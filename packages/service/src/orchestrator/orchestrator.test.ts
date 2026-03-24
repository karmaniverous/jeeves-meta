import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { MetaContext } from '../interfaces/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
import { mergeAndWrite } from './merge.js';
import {
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';

const testRoot = join(tmpdir(), `jeeves-meta-orch-${Date.now().toString()}`);

const sampleConfig: MetaConfig = {
  watcherUrl: 'http://localhost:3456',
  gatewayUrl: 'http://127.0.0.1:3000',
  depthWeight: 1,
  architectEvery: 10,
  maxArchive: 20,
  maxLines: 500,
  architectTimeout: 120,
  builderTimeout: 600,
  criticTimeout: 300,
  thinking: 'low',
  defaultArchitect: 'You are an architect. Analyze the data shape.',
  defaultCritic: 'You are a critic. Evaluate the synthesis.',
  skipUnchanged: true,
  metaProperty: { domains: ['meta'] },
  metaArchiveProperty: { domains: ['meta-archive'] },
};

const sampleMeta: MetaJson = {
  _id: '550e8400-e29b-41d4-a716-446655440000',
  _content: '# Previous synthesis',
  _feedback: 'Good but needs more detail.',
  _steer: 'Focus on trends.',
  _generatedAt: '2026-03-08T07:00:00Z',
};

const sampleCtx: MetaContext = {
  path: '/test/.meta',
  scopeFiles: ['/test/a.md', '/test/b.md', '/test/sub/c.md'],
  deltaFiles: ['/test/b.md'],
  childMetas: { '/test/sub': 'Child synthesis content' },
  crossRefMetas: {},
  previousContent: '# Previous synthesis',
  previousFeedback: 'Good but needs more detail.',
  steer: 'Focus on trends.',
  previousState: null,
  archives: [],
};

describe('buildArchitectTask', () => {
  it('includes scope, steer, previous content, previous feedback, and child metas', () => {
    const task = buildArchitectTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('You are an architect');
    expect(task).toContain('/test/a.md');
    expect(task).toContain('Focus on trends');
    expect(task).toContain('Previous synthesis');
    expect(task).toContain('Good but needs more detail');
    expect(task).toContain('Child synthesis content');
  });

  it('uses meta._architect override when present', () => {
    const meta: MetaJson = {
      ...sampleMeta,
      _architect: 'Custom architect prompt',
    };
    const task = buildArchitectTask(sampleCtx, meta, sampleConfig);
    expect(task).toContain('Custom architect prompt');
    expect(task).not.toContain('You are an architect');
  });
});

describe('buildBuilderTask', () => {
  it('includes task brief, delta files, and feedback', () => {
    const meta: MetaJson = {
      ...sampleMeta,
      _builder: 'Analyze email patterns',
    };
    const task = buildBuilderTask(sampleCtx, meta, sampleConfig);
    expect(task).toContain('Analyze email patterns');
    expect(task).toContain('/test/b.md');
    expect(task).toContain('Good but needs more detail');
  });

  it('includes PREVIOUS STATE section when previousState is set', () => {
    const ctx: MetaContext = {
      ...sampleCtx,
      previousState: { step: 2, pending: ['x'] },
    };
    const meta: MetaJson = { ...sampleMeta, _builder: 'brief' };
    const task = buildBuilderTask(ctx, meta, sampleConfig);
    expect(task).toContain('## PREVIOUS STATE');
    expect(task).toContain('"step": 2');
    expect(task).toContain('"pending"');
  });

  it('omits PREVIOUS STATE section when previousState is null', () => {
    const task = buildBuilderTask(
      sampleCtx,
      { ...sampleMeta, _builder: 'brief' },
      sampleConfig,
    );
    expect(task).not.toContain('## PREVIOUS STATE');
  });

  it('mentions _state in OUTPUT FORMAT', () => {
    const task = buildBuilderTask(
      sampleCtx,
      { ...sampleMeta, _builder: 'brief' },
      sampleConfig,
    );
    expect(task).toContain('_state');
  });
});

describe('buildCriticTask', () => {
  it('includes system prompt, content to evaluate, and scope', () => {
    const task = buildCriticTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('You are a critic');
    expect(task).toContain('Previous synthesis');
    expect(task).toContain('Focus on trends');
  });
});

describe('cross-referenced metas in prompts', () => {
  const ctxWithCrossRefs: MetaContext = {
    ...sampleCtx,
    crossRefMetas: {
      '/ref/path/a': 'Cross-ref A content',
      '/ref/path/b': null,
    },
  };

  const ctxNoCrossRefs: MetaContext = {
    ...sampleCtx,
    crossRefMetas: {},
  };

  it('architect task includes CROSS-REFERENCED METAS section when non-empty', () => {
    const task = buildArchitectTask(ctxWithCrossRefs, sampleMeta, sampleConfig);
    expect(task).toContain('## CROSS-REFERENCED METAS');
    expect(task).toContain('### /ref/path/a');
    expect(task).toContain('Cross-ref A content');
    expect(task).toContain('### /ref/path/b');
    expect(task).toContain('(not yet synthesized)');
  });

  it('architect task omits CROSS-REFERENCED METAS section when empty', () => {
    const task = buildArchitectTask(ctxNoCrossRefs, sampleMeta, sampleConfig);
    expect(task).not.toContain('## CROSS-REFERENCED METAS');
  });

  it('builder task includes CROSS-REFERENCED METAS section when non-empty', () => {
    const meta: MetaJson = { ...sampleMeta, _builder: 'brief' };
    const task = buildBuilderTask(ctxWithCrossRefs, meta, sampleConfig);
    expect(task).toContain('## CROSS-REFERENCED METAS');
    expect(task).toContain('### /ref/path/a');
    expect(task).toContain('Cross-ref A content');
  });

  it('builder task omits CROSS-REFERENCED METAS section when empty', () => {
    const meta: MetaJson = { ...sampleMeta, _builder: 'brief' };
    const task = buildBuilderTask(ctxNoCrossRefs, meta, sampleConfig);
    expect(task).not.toContain('## CROSS-REFERENCED METAS');
  });

  it('critic task does NOT include CROSS-REFERENCED METAS section', () => {
    const task = buildCriticTask(ctxWithCrossRefs, sampleMeta, sampleConfig);
    expect(task).not.toContain('## CROSS-REFERENCED METAS');
  });
});

describe('parseArchitectOutput', () => {
  it('trims and returns text', () => {
    expect(parseArchitectOutput('  task brief  \n')).toBe('task brief');
  });
});

describe('parseBuilderOutput', () => {
  it('parses JSON with _content', () => {
    const out = parseBuilderOutput(
      JSON.stringify({
        _content: '# Synthesis',
        topics: ['a', 'b'],
      }),
    );
    expect(out.content).toBe('# Synthesis');
    expect(out.fields).toEqual({ topics: ['a', 'b'] });
  });

  it('handles markdown-fenced JSON', () => {
    const out = parseBuilderOutput('```json\n{"_content": "hi"}\n```');
    expect(out.content).toBe('hi');
  });

  it('treats non-JSON output as plain content', () => {
    const out = parseBuilderOutput('Just a narrative');
    expect(out.content).toBe('Just a narrative');
    expect(out.fields).toEqual({});
  });

  it('extracts _state from JSON output', () => {
    const out = parseBuilderOutput(
      JSON.stringify({
        _content: '# Progress',
        _state: { step: 2, pending: ['x'] },
        topics: ['a'],
      }),
    );
    expect(out.content).toBe('# Progress');
    expect(out.state).toEqual({ step: 2, pending: ['x'] });
    expect(out.fields).toEqual({ topics: ['a'] });
  });

  it('does not set state when _state is absent', () => {
    const out = parseBuilderOutput(JSON.stringify({ _content: 'no state' }));
    expect(out.state).toBeUndefined();
  });
});

describe('parseCriticOutput', () => {
  it('trims and returns text', () => {
    expect(parseCriticOutput('  good work  \n')).toBe('good work');
  });
});

describe('mergeAndWrite', () => {
  const metaPath = join(testRoot, '.meta');

  it('writes merged meta.json', async () => {
    mkdirSync(metaPath, { recursive: true });

    const result = await mergeAndWrite({
      metaPath,
      current: sampleMeta,
      architect: 'architect prompt',
      builder: 'builder brief',
      critic: 'critic prompt',
      builderOutput: { content: '# New synthesis', fields: { topics: ['x'] } },
      feedback: 'Excellent.',
      structureHash: 'abc123',
      synthesisCount: 1,
      error: null,
    });

    expect(result._content).toBe('# New synthesis');
    expect(result._feedback).toBe('Excellent.');
    expect(result._structureHash).toBe('abc123');
    expect(result._synthesisCount).toBe(1);
    expect(result._id).toBe(sampleMeta._id);
    expect(result._steer).toBe('Focus on trends.');
    // Structured fields
    expect((result as Record<string, unknown>).topics).toEqual(['x']);

    rmSync(testRoot, { recursive: true, force: true });
  });

  it('preserves previous content when builder is null', async () => {
    mkdirSync(metaPath, { recursive: true });

    const result = await mergeAndWrite({
      metaPath,
      current: sampleMeta,
      architect: 'a',
      builder: 'b',
      critic: 'c',
      builderOutput: null,
      feedback: null,
      structureHash: 'hash',
      synthesisCount: 0,
      error: { step: 'builder', code: 'FAILED', message: 'timeout' },
    });

    expect(result._content).toBe('# Previous synthesis');
    expect(result._error?.step).toBe('builder');

    rmSync(testRoot, { recursive: true, force: true });
  });

  it('persists _state in merged output', async () => {
    mkdirSync(metaPath, { recursive: true });

    const result = await mergeAndWrite({
      metaPath,
      current: sampleMeta,
      architect: 'a',
      builder: 'b',
      critic: 'c',
      builderOutput: { content: '# Content', fields: {} },
      feedback: null,
      structureHash: 'hash',
      synthesisCount: 1,
      error: null,
      state: { step: 3, pending: ['z'] },
    });

    expect(result._state).toEqual({ step: 3, pending: ['z'] });

    rmSync(testRoot, { recursive: true, force: true });
  });

  it('stateOnly preserves _content and _generatedAt from current', async () => {
    mkdirSync(metaPath, { recursive: true });

    const result = await mergeAndWrite({
      metaPath,
      current: sampleMeta,
      architect: 'a',
      builder: 'b',
      critic: 'c',
      builderOutput: null,
      feedback: null,
      structureHash: 'hash',
      synthesisCount: 0,
      error: { step: 'builder', code: 'TIMEOUT', message: 'timed out' },
      state: { step: 4 },
      stateOnly: true,
    });

    expect(result._content).toBe('# Previous synthesis');
    expect(result._generatedAt).toBe('2026-03-08T07:00:00Z');
    expect(result._state).toEqual({ step: 4 });
    expect(result._error?.code).toBe('TIMEOUT');

    rmSync(testRoot, { recursive: true, force: true });
  });

  it('auto-generates _id when current meta has no _id', async () => {
    mkdirSync(metaPath, { recursive: true });

    const metaWithoutId: MetaJson = {
      _content: '# Test',
      _generatedAt: '2026-03-08T07:00:00Z',
    };

    const result = await mergeAndWrite({
      metaPath,
      current: metaWithoutId,
      architect: 'a',
      builder: 'b',
      critic: 'c',
      builderOutput: { content: '# New', fields: {} },
      feedback: null,
      structureHash: 'hash',
      synthesisCount: 1,
      error: null,
    });

    expect(result._id).toBeDefined();
    expect(result._id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    rmSync(testRoot, { recursive: true, force: true });
  });

  it('preserves existing _id when present', async () => {
    mkdirSync(metaPath, { recursive: true });

    const result = await mergeAndWrite({
      metaPath,
      current: sampleMeta,
      architect: 'a',
      builder: 'b',
      critic: 'c',
      builderOutput: { content: '# New', fields: {} },
      feedback: null,
      structureHash: 'hash',
      synthesisCount: 1,
      error: null,
    });

    expect(result._id).toBe(sampleMeta._id);

    rmSync(testRoot, { recursive: true, force: true });
  });
});
