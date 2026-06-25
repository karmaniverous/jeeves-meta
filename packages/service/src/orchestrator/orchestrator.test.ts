import { describe, expect, it, vi } from 'vitest';

// Mock prompts so tests use stable, known template expressions.
vi.mock('../prompts/index.js', () => ({
  DEFAULT_ARCHITECT_PROMPT:
    'You are an architect. Every {{config.architectEvery}} cycles, ' +
    '{{scope.fileCount}} files, depth {{meta._depth}}. ' +
    'Escaped: \\{{config.architectEvery}}.',
  DEFAULT_CRITIC_PROMPT: 'You are a critic. Max lines: {{config.maxLines}}.',
}));

import type { MetaContext } from '../interfaces/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
import {
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';

const sampleConfig: MetaConfig = {
  watcherUrl: 'http://localhost:3456',
  gatewayUrl: 'http://127.0.0.1:3000',
  depthWeight: 1,
  architectEvery: 10,
  maxArchive: 20,
  maxLines: 500,
  thinking: 'low',
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
  it('includes built-in prompt, scope, steer, previous content, previous feedback, and child metas', () => {
    const task = buildArchitectTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('You are an architect');
    expect(task).toContain('/test/a.md');
    expect(task).toContain('Focus on trends');
    expect(task).toContain('Previous synthesis');
    expect(task).toContain('Good but needs more detail');
    expect(task).toContain('Child synthesis content');
  });

  it('ignores meta._architect snapshot and always uses DEFAULT_ARCHITECT_PROMPT', () => {
    const meta: MetaJson = {
      ...sampleMeta,
      _architect: 'Stale snapshot prompt',
    };
    const task = buildArchitectTask(sampleCtx, meta, sampleConfig);
    expect(task).not.toContain('Stale snapshot prompt');
    expect(task).toContain('You are an architect');
  });

  it('includes IMPORTANT sub-agent prohibition in builder task output format', () => {
    const task = buildBuilderTask(
      sampleCtx,
      { ...sampleMeta, _builder: 'brief' },
      sampleConfig,
    );
    expect(task).toContain('Do not call sessions_spawn or sessions_yield');
    expect(task).toContain(
      'Do not attempt to parallelize work by spawning sub-agents',
    );
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
  it('includes built-in critic prompt, content to evaluate, and steer', () => {
    const task = buildCriticTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('You are a critic');
    expect(task).toContain('Previous synthesis');
    expect(task).toContain('Focus on trends');
  });
});

describe('Handlebars template compilation in prompts', () => {
  // Prompts are mocked at module level (vi.mock above) with template expressions.
  // These tests verify that Handlebars compilation resolves those expressions.

  it('resolves {{config.*}} values in DEFAULT_ARCHITECT_PROMPT', () => {
    // Mock prompt: '...Every {{config.architectEvery}} cycles...'
    const task = buildArchitectTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('Every 10 cycles');
  });

  it('resolves {{scope.*}} values in DEFAULT_ARCHITECT_PROMPT', () => {
    // Mock prompt: '...{{scope.fileCount}} files...'
    const task = buildArchitectTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('3 files');
  });

  it('resolves {{meta.*}} values in DEFAULT_ARCHITECT_PROMPT', () => {
    // Mock prompt: '...depth {{meta._depth}}...'
    const meta: MetaJson = { ...sampleMeta, _depth: 3 };
    const task = buildArchitectTask(sampleCtx, meta, sampleConfig);
    expect(task).toContain('depth 3');
  });

  it('escaped \\{{...}} in DEFAULT_ARCHITECT_PROMPT passes through as literal {{...}}', () => {
    // Mock prompt: '...Escaped: \\{{config.architectEvery}}...'
    const task = buildArchitectTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('Escaped: {{config.architectEvery}}');
  });

  it('architect-written template expressions in _builder resolve in builder prompt', () => {
    // Architect wrote {{config.architectEvery}} into _builder brief
    const meta: MetaJson = {
      ...sampleMeta,
      _builder: 'You have {{config.architectEvery}} cycles to complete.',
    };
    const task = buildBuilderTask(sampleCtx, meta, sampleConfig);
    // Builder sees the resolved value
    expect(task).toContain('You have 10 cycles to complete.');
    expect(task).not.toContain('{{config.architectEvery}}');
  });

  it('invalid Handlebars expression in _builder does not throw (graceful fallback)', () => {
    const meta: MetaJson = {
      ...sampleMeta,
      _builder: 'Valid text with {{#if broken',
    };
    // Should not throw — compileTemplate returns original text on failure
    const task = buildBuilderTask(sampleCtx, meta, sampleConfig);
    expect(task).toContain('Valid text with {{#if broken');
  });

  it('resolves {{config.*}} in DEFAULT_CRITIC_PROMPT', () => {
    // Mock prompt: '...Max lines: {{config.maxLines}}...'
    const task = buildCriticTask(sampleCtx, sampleMeta, sampleConfig);
    expect(task).toContain('Max lines: 500');
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

  it('strips trailing ANNOUNCE_SKIP sentinel', () => {
    expect(parseArchitectOutput('task brief\nANNOUNCE_SKIP')).toBe(
      'task brief',
    );
  });

  it('strips ANNOUNCE_SKIP with surrounding whitespace', () => {
    expect(parseArchitectOutput('  task brief  \n  ANNOUNCE_SKIP  ')).toBe(
      'task brief',
    );
  });

  it('preserves text when ANNOUNCE_SKIP is not at the end', () => {
    expect(parseArchitectOutput('ANNOUNCE_SKIP then more text')).toBe(
      'ANNOUNCE_SKIP then more text',
    );
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
    expect(out).not.toBeNull();
    expect(out!.content).toBe('# Synthesis');
    expect(out!.fields).toEqual({ topics: ['a', 'b'] });
  });

  it('handles markdown-fenced JSON', () => {
    const out = parseBuilderOutput('```json\n{"_content": "hi"}\n```');
    expect(out).not.toBeNull();
    expect(out!.content).toBe('hi');
  });

  it('returns null for non-JSON output (self-talk / plain text)', () => {
    const out = parseBuilderOutput('Just a narrative');
    expect(out).toBeNull();
  });

  it('strips trailing ANNOUNCE_SKIP from JSON output before parsing', () => {
    const out = parseBuilderOutput(
      JSON.stringify({ _content: '# Synthesis' }) + '\nANNOUNCE_SKIP',
    );
    expect(out).not.toBeNull();
    expect(out!.content).toBe('# Synthesis');
  });

  it('returns null for plain text with ANNOUNCE_SKIP (no JSON content)', () => {
    const out = parseBuilderOutput('Just narrative\nANNOUNCE_SKIP');
    expect(out).toBeNull();
  });

  it('extracts _state from JSON output', () => {
    const out = parseBuilderOutput(
      JSON.stringify({
        _content: '# Progress',
        _state: { step: 2, pending: ['x'] },
        topics: ['a'],
      }),
    );
    expect(out).not.toBeNull();
    expect(out!.content).toBe('# Progress');
    expect(out!.state).toEqual({ step: 2, pending: ['x'] });
    expect(out!.fields).toEqual({ topics: ['a'] });
  });

  it('does not set state when _state is absent', () => {
    const out = parseBuilderOutput(JSON.stringify({ _content: 'no state' }));
    expect(out).not.toBeNull();
    expect(out!.state).toBeUndefined();
  });
});

describe('parseCriticOutput', () => {
  it('trims and returns text', () => {
    expect(parseCriticOutput('  good work  \n')).toBe('good work');
  });

  it('strips trailing ANNOUNCE_SKIP sentinel', () => {
    expect(parseCriticOutput('good work\nANNOUNCE_SKIP')).toBe('good work');
  });
});
