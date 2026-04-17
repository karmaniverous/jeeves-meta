import { describe, expect, it } from 'vitest';

import type { MetaJson } from '../schema/meta.js';
import { derivePhaseState } from './derivePhaseState.js';

describe('derivePhaseState', () => {
  it('returns existing _phaseState when present', () => {
    const meta: MetaJson = {
      _phaseState: { architect: 'fresh', builder: 'pending', critic: 'stale' },
    };
    expect(derivePhaseState(meta)).toEqual({
      architect: 'fresh',
      builder: 'pending',
      critic: 'stale',
    });
  });

  it('never-synthesized meta (empty): architect pending', () => {
    const meta: MetaJson = {};
    const result = derivePhaseState(meta);
    expect(result).toEqual({
      architect: 'pending',
      builder: 'stale',
      critic: 'stale',
    });
  });

  it('fully fresh meta: all fresh', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'output',
      _feedback: 'good',
      _generatedAt: new Date().toISOString(),
    };
    const result = derivePhaseState(meta);
    expect(result).toEqual({
      architect: 'fresh',
      builder: 'fresh',
      critic: 'fresh',
    });
  });

  it('errored at architect with no cached builder', () => {
    const meta: MetaJson = {
      _error: { step: 'architect', code: 'TIMEOUT', message: 'Timed out' },
    };
    const result = derivePhaseState(meta);
    expect(result.architect).toBe('failed');
    expect(result.builder).toBe('stale');
    expect(result.critic).toBe('stale');
  });

  it('errored at builder', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'old content',
      _error: { step: 'builder', code: 'ERROR', message: 'Failed' },
    };
    const result = derivePhaseState(meta);
    expect(result.builder).toBe('failed');
    expect(result.critic).toBe('stale');
    expect(result.architect).toBe('fresh');
  });

  it('errored at critic', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'content',
      _error: { step: 'critic', code: 'ERROR', message: 'Failed' },
    };
    const result = derivePhaseState(meta);
    expect(result.critic).toBe('failed');
    expect(result.architect).toBe('fresh');
    expect(result.builder).toBe('fresh');
  });

  it('mid-cycle: has _builder but no _content → builder pending', () => {
    const meta: MetaJson = {
      _builder: 'some brief',
      _generatedAt: new Date().toISOString(),
    };
    const result = derivePhaseState(meta);
    expect(result).toEqual({
      architect: 'fresh',
      builder: 'pending',
      critic: 'stale',
    });
  });

  it('has content but no feedback → critic pending', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'content',
      _generatedAt: new Date().toISOString(),
    };
    const result = derivePhaseState(meta);
    expect(result).toEqual({
      architect: 'fresh',
      builder: 'fresh',
      critic: 'pending',
    });
  });

  it('architect invalidated via inputs: structure changed', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'content',
      _feedback: 'ok',
      _generatedAt: new Date().toISOString(),
    };
    const result = derivePhaseState(meta, {
      structureChanged: true,
      steerChanged: false,
      architectChanged: false,
      crossRefsChanged: false,
      architectEvery: 10,
    });
    expect(result).toEqual({
      architect: 'pending',
      builder: 'stale',
      critic: 'stale',
    });
  });

  it('architect invalidated via inputs: synthesisCount >= architectEvery', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'content',
      _feedback: 'ok',
      _generatedAt: new Date().toISOString(),
      _synthesisCount: 10,
    };
    const result = derivePhaseState(meta, {
      structureChanged: false,
      steerChanged: false,
      architectChanged: false,
      crossRefsChanged: false,
      architectEvery: 10,
    });
    expect(result.architect).toBe('pending');
  });
});
