/**
 * Parse subprocess outputs for each synthesis step.
 *
 * - Architect: returns text \> _builder
 * - Builder: returns JSON \> _content + structured fields
 * - Critic: returns text \> _feedback
 *
 * @module orchestrator/parseOutput
 */

/** Sentinel appended by synthesis workers to skip the announce turn. */
const ANNOUNCE_SKIP = 'ANNOUNCE_SKIP';

/** Strip a trailing ANNOUNCE_SKIP sentinel from raw output. */
function stripSentinel(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.endsWith(ANNOUNCE_SKIP)
    ? trimmed.slice(0, -ANNOUNCE_SKIP.length).trim()
    : trimmed;
}

/** Parsed builder output. */
export interface BuilderOutput {
  /** Narrative synthesis content. */
  content: string;
  /** Additional structured fields (non-underscore keys). */
  fields: Record<string, unknown>;
  /** Opaque state for progressive synthesis, if provided by the builder. */
  state?: unknown;
}

/**
 * Parse architect output. The architect returns a task brief as text.
 *
 * @param output - Raw subprocess output.
 * @returns The task brief string.
 */
export function parseArchitectOutput(output: string): string {
  return stripSentinel(output);
}

/**
 * Parse builder output. The builder returns JSON with _content and optional fields.
 *
 * Attempts JSON extraction via multiple strategies. Returns null if all strategies fail
 * (e.g. the output is plain text, self-talk, or a sub-agent delegation response).
 *
 * @param output - Raw subprocess output.
 * @returns Parsed builder output, or null if output is not valid builder JSON.
 */
export function parseBuilderOutput(output: string): BuilderOutput | null {
  const trimmed = stripSentinel(output);

  // Strategy 1: Try to parse the entire output as JSON directly
  const direct = tryParseJson(trimmed);
  if (direct) return direct;

  // Strategy 2: Try all fenced code blocks (last match first — models often narrate then output)
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/g;
  const fenceMatches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(trimmed)) !== null) {
    fenceMatches.push(match[1].trim());
  }
  // Try last fence first (most likely to be the actual output)
  for (let i = fenceMatches.length - 1; i >= 0; i--) {
    const result = tryParseJson(fenceMatches[i]);
    if (result) return result;
  }

  // Strategy 3: Find outermost { ... } braces
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const result = tryParseJson(trimmed.substring(firstBrace, lastBrace + 1));
    if (result) return result;
  }

  // All JSON strategies failed — not valid builder output
  return null;
}

/** Try to parse a string as JSON and extract builder output fields. */
function tryParseJson(str: string): BuilderOutput | null {
  try {
    const raw: unknown = JSON.parse(str);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return null;
    }

    const parsed = raw as Record<string, unknown>;

    // Extract _content
    const content =
      typeof parsed['_content'] === 'string'
        ? parsed['_content']
        : typeof parsed['content'] === 'string'
          ? parsed['content']
          : null;

    if (content === null) return null;

    // Extract _state (the ONLY underscore key the builder is allowed to set)
    const state = '_state' in parsed ? parsed['_state'] : undefined;

    // Extract non-underscore fields
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith('_') && key !== 'content') {
        fields[key] = value;
      }
    }

    return { content, fields, ...(state !== undefined ? { state } : {}) };
  } catch {
    return null;
  }
}

/**
 * Parse critic output. The critic returns evaluation text.
 *
 * @param output - Raw subprocess output.
 * @returns The feedback string.
 */
export function parseCriticOutput(output: string): string {
  return stripSentinel(output);
}
