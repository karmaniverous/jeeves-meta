import { describe, expect, it } from 'vitest';

import { metaJsonSchema } from './meta.js';

describe('metaJsonSchema', () => {
  it('accepts minimal meta with only _id', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty meta without _id (optional)', () => {
    const result = metaJsonSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?._id).toBeUndefined();
  });

  it('accepts full meta with all reserved fields', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _steer: 'Focus on API changes',
      _architect: 'You are the architect...',
      _builder: 'Analyze the following...',
      _critic: 'You are the critic...',
      _generatedAt: '2026-03-08T07:00:00Z',
      _content: '# Synthesis\n\nContent here.',
      _structureHash: 'abc123',
      _synthesisCount: 5,
      _feedback: 'Good coverage but missing edge cases.',
      _depth: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts custom (non-underscore) fields via passthrough', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'My synthesis',
      tags: ['email', 'summary'],
      stats: { fileCount: 42 },
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('title', 'My synthesis');
  });

  it('accepts meta with _error field', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _error: {
        step: 'builder',
        code: 'TIMEOUT',
        message: 'Builder timed out after 600s',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts archive snapshot fields', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _archived: true,
      _archivedAt: '2026-03-08T07:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid _id (not UUID)', () => {
    const result = metaJsonSchema.safeParse({ _id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid _error step', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _error: { step: 'invalid', code: 'ERR', message: 'bad' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts _state with arbitrary data', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _state: { step: 3, progress: 'analyzing', pending: ['a', 'b'] },
    });
    expect(result.success).toBe(true);
    expect(result.data?._state).toEqual({
      step: 3,
      progress: 'analyzing',
      pending: ['a', 'b'],
    });
  });

  it('accepts _state as null', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _state: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative _synthesisCount', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _synthesisCount: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts _crossRefs as array of strings', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _crossRefs: ['j:/path/a', 'j:/path/b'],
    });
    expect(result.success).toBe(true);
    expect(result.data?._crossRefs).toEqual(['j:/path/a', 'j:/path/b']);
  });

  it('accepts meta without _crossRefs', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
    expect(result.data?._crossRefs).toBeUndefined();
  });

  it('accepts _crossRefs as empty array', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _crossRefs: [],
    });
    expect(result.success).toBe(true);
    expect(result.data?._crossRefs).toEqual([]);
  });

  it('rejects _crossRefs with non-string elements', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _crossRefs: [42, true],
    });
    expect(result.success).toBe(false);
  });

  it('rejects _crossRefs as a plain string (not array)', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _crossRefs: 'j:/path/a',
    });
    expect(result.success).toBe(false);
  });

  it('accepts _disabled: true', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _disabled: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?._disabled).toBe(true);
  });

  it('accepts _disabled: false', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _disabled: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?._disabled).toBe(false);
  });

  it('accepts meta without _disabled (optional)', () => {
    const result = metaJsonSchema.safeParse({
      _id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
    expect(result.data?._disabled).toBeUndefined();
  });

  // ── _phaseState schema tests (Task #1 gap) ────────────────────────

  it('accepts valid _phaseState with all fresh', () => {
    const result = metaJsonSchema.safeParse({
      _phaseState: {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'fresh',
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?._phaseState).toEqual({
      architect: 'fresh',
      builder: 'fresh',
      critic: 'fresh',
    });
  });

  it('accepts valid _phaseState with mixed statuses', () => {
    const result = metaJsonSchema.safeParse({
      _phaseState: {
        architect: 'pending',
        builder: 'stale',
        critic: 'failed',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts _phaseState with running status', () => {
    const result = metaJsonSchema.safeParse({
      _phaseState: {
        architect: 'fresh',
        builder: 'running',
        critic: 'stale',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects _phaseState with invalid status string', () => {
    const result = metaJsonSchema.safeParse({
      _phaseState: {
        architect: 'fresh',
        builder: 'invalid_status',
        critic: 'fresh',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects _phaseState missing a phase key', () => {
    const result = metaJsonSchema.safeParse({
      _phaseState: {
        architect: 'fresh',
        builder: 'fresh',
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts meta without _phaseState (optional)', () => {
    const result = metaJsonSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?._phaseState).toBeUndefined();
  });
});
