/**
 * Build task prompts for each synthesis step.
 *
 * Serializes the relevant parts of SynthContext into each subprocess's
 * task prompt. Subprocesses handle step-specific work via tools.
 *
 * @module orchestrator/buildTask
 */

import type { SynthContext } from '../interfaces/index.js';
import type { MetaJson, SynthConfig } from '../schema/index.js';

/**
 * Build the architect task prompt.
 *
 * @param ctx - Synthesis context.
 * @param meta - Current meta.json.
 * @param config - Synthesis config.
 * @returns The architect task prompt string.
 */
export function buildArchitectTask(
  ctx: SynthContext,
  meta: MetaJson,
  config: SynthConfig,
): string {
  const systemPrompt = meta._architect ?? config.defaultArchitect;

  const sections = [
    systemPrompt,
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Total files in scope: ${ctx.scopeFiles.length.toString()}`,
    `Files changed since last synthesis: ${ctx.deltaFiles.length.toString()}`,
    '',
    '### File listing (scope)',
    ...ctx.scopeFiles.slice(0, config.maxLines).map((f) => `- ${f}`),
  ];

  if (ctx.steer) {
    sections.push('', '## STEERING PROMPT', ctx.steer);
  }

  if (ctx.previousContent) {
    sections.push('', '## PREVIOUS SYNTHESIS', ctx.previousContent);
  }

  if (ctx.previousFeedback) {
    sections.push('', '## PREVIOUS FEEDBACK', ctx.previousFeedback);
  }

  if (Object.keys(ctx.childMetas).length > 0) {
    sections.push('', '## CHILD META OUTPUTS');
    for (const [childPath, content] of Object.entries(ctx.childMetas)) {
      sections.push(
        `### ${childPath}`,
        typeof content === 'string' ? content : '(not yet synthesized)',
      );
    }
  }

  return sections.join('\n');
}

/**
 * Build the builder task prompt.
 *
 * @param ctx - Synthesis context.
 * @param meta - Current meta.json.
 * @param config - Synthesis config.
 * @returns The builder task prompt string.
 */
export function buildBuilderTask(
  ctx: SynthContext,
  meta: MetaJson,
  config: SynthConfig,
): string {
  const builder = meta._builder ?? '(No architect brief available)';

  const sections = [
    '## TASK BRIEF (from Architect)',
    builder,
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Delta files (${ctx.deltaFiles.length.toString()} changed):`,
    ...ctx.deltaFiles.slice(0, config.maxLines).map((f) => `- ${f}`),
  ];

  if (ctx.previousContent) {
    sections.push('', '## PREVIOUS SYNTHESIS', ctx.previousContent);
  }

  if (ctx.previousFeedback) {
    sections.push('', '## FEEDBACK FROM CRITIC', ctx.previousFeedback);
  }

  if (Object.keys(ctx.childMetas).length > 0) {
    sections.push('', '## CHILD META OUTPUTS');
    for (const [childPath, content] of Object.entries(ctx.childMetas)) {
      sections.push(
        `### ${childPath}`,
        typeof content === 'string' ? content : '(not yet synthesized)',
      );
    }
  }

  sections.push(
    '',
    '## OUTPUT FORMAT',
    'Return a JSON object with:',
    '- "_content": Markdown narrative synthesis (required)',
    '- Any additional structured fields as non-underscore keys',
  );

  return sections.join('\n');
}

/**
 * Build the critic task prompt.
 *
 * @param ctx - Synthesis context.
 * @param meta - Current meta.json (with _content already set by builder).
 * @param config - Synthesis config.
 * @returns The critic task prompt string.
 */
export function buildCriticTask(
  ctx: SynthContext,
  meta: MetaJson,
  config: SynthConfig,
): string {
  const systemPrompt = meta._critic ?? config.defaultCritic;

  const sections = [
    systemPrompt,
    '',
    '## SYNTHESIS TO EVALUATE',
    meta._content ?? '(No content produced)',
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Files in scope: ${ctx.scopeFiles.length.toString()}`,
  ];

  if (ctx.steer) {
    sections.push('', '## STEERING PROMPT', ctx.steer);
  }

  if (ctx.previousFeedback) {
    sections.push('', '## YOUR PREVIOUS FEEDBACK', ctx.previousFeedback);
  }

  sections.push(
    '',
    '## OUTPUT FORMAT',
    'Return your evaluation as Markdown text. Be specific and actionable.',
  );

  return sections.join('\n');
}
