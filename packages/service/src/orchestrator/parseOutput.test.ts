/**
 * Unit tests for parseBuilderOutput.
 *
 * Verifies that:
 * - Valid JSON with _content is parsed correctly.
 * - JSON embedded in prose (self-talk) is extracted via brace strategy.
 * - Plain text, self-talk without JSON, and sub-agent delegation text return null.
 * - The ANNOUNCE_SKIP sentinel is stripped before parsing.
 *
 * @module orchestrator/parseOutput.test
 */

import { describe, expect, it } from 'vitest';

import { parseBuilderOutput } from './parseOutput.js';

describe('parseBuilderOutput', () => {
  // ── Valid JSON ─────────────────────────────────────────────────────

  it('parses a minimal valid JSON object with _content', () => {
    const output = JSON.stringify({ _content: 'Hello world' });
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Hello world');
    expect(result!.fields).toEqual({});
    expect(result!.state).toBeUndefined();
  });

  it('parses JSON with _content and structured fields', () => {
    const output = JSON.stringify({
      _content: 'Synthesis result',
      status: 'active',
      risk: 'low',
    });
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Synthesis result');
    expect(result!.fields).toEqual({ status: 'active', risk: 'low' });
  });

  it('parses JSON with _state field', () => {
    const output = JSON.stringify({
      _content: 'Progress update',
      _state: { cursor: 5, processed: ['a', 'b'] },
    });
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Progress update');
    expect(result!.state).toEqual({ cursor: 5, processed: ['a', 'b'] });
  });

  it('accepts "content" as an alias for "_content"', () => {
    const output = JSON.stringify({ content: 'Via alias' });
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Via alias');
  });

  // ── JSON extraction strategies ─────────────────────────────────────

  it('extracts JSON from a fenced code block', () => {
    const json = JSON.stringify({ _content: 'Fenced content' });
    const output = `Some preamble text.\n\`\`\`json\n${json}\n\`\`\``;
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Fenced content');
  });

  it('prefers the last fenced code block when multiple exist', () => {
    const json1 = JSON.stringify({ _content: 'First block' });
    const json2 = JSON.stringify({ _content: 'Second block' });
    const output = `\`\`\`json\n${json1}\n\`\`\`\nsome text\n\`\`\`json\n${json2}\n\`\`\``;
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Second block');
  });

  it('extracts JSON using outermost brace strategy from self-talk prose', () => {
    const json = JSON.stringify({ _content: 'Embedded result' });
    const output = `I have analyzed the files. Here is my output: ${json}\nThat concludes my work.`;
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Embedded result');
  });

  // ── Non-JSON input returns null ────────────────────────────────────

  it('returns null for plain text (no JSON)', () => {
    const result = parseBuilderOutput('This is just plain text with no JSON.');
    expect(result).toBeNull();
  });

  it('returns null for self-talk text without any JSON object', () => {
    const result = parseBuilderOutput(
      'I need to read more files before I can produce output. Let me start by examining the repository structure.',
    );
    expect(result).toBeNull();
  });

  it('returns null for sub-agent delegation text', () => {
    const result = parseBuilderOutput(
      'I will now spawn a sub-agent to handle this task in parallel.',
    );
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = parseBuilderOutput('');
    expect(result).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    const result = parseBuilderOutput('   \n  \t  ');
    expect(result).toBeNull();
  });

  it('returns null for JSON missing _content', () => {
    const result = parseBuilderOutput(JSON.stringify({ status: 'active' }));
    expect(result).toBeNull();
  });

  it('returns null for a JSON array (not an object)', () => {
    const result = parseBuilderOutput(JSON.stringify([1, 2, 3]));
    expect(result).toBeNull();
  });

  it('returns null for JSON with null _content', () => {
    const result = parseBuilderOutput(JSON.stringify({ _content: null }));
    expect(result).toBeNull();
  });

  it('returns null for JSON with numeric _content', () => {
    const result = parseBuilderOutput(JSON.stringify({ _content: 42 }));
    expect(result).toBeNull();
  });

  // ── ANNOUNCE_SKIP sentinel stripping ──────────────────────────────

  it('strips trailing ANNOUNCE_SKIP before parsing', () => {
    const json = JSON.stringify({ _content: 'Skip test' });
    const output = `${json}ANNOUNCE_SKIP`;
    const result = parseBuilderOutput(output);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Skip test');
  });
});
