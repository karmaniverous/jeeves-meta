/**
 * Build task prompts for each synthesis step.
 *
 * Prompts are compiled as Handlebars templates with access to config,
 * meta, and scope context. The architect can write template expressions
 * into its _builder output; these resolve when the builder task is compiled.
 *
 * @module orchestrator/buildTask
 */

import Handlebars from 'handlebars';

import type { MetaContext } from '../interfaces/index.js';
import {
  DEFAULT_ARCHITECT_PROMPT,
  DEFAULT_CRITIC_PROMPT,
} from '../prompts/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import { condenseScopeFiles } from './contextPackage.js';

/** Template context available to all prompt templates. */
interface TemplateContext {
  config: MetaConfig;
  meta: MetaJson;
  scope: {
    fileCount: number;
    deltaCount: number;
    childCount: number;
    crossRefCount: number;
  };
}

/** Build the template context from synthesis inputs. */
function buildTemplateContext(
  ctx: MetaContext,
  meta: MetaJson,
  config: MetaConfig,
): TemplateContext {
  return {
    config,
    meta,
    scope: {
      fileCount: ctx.scopeFiles.length,
      deltaCount: ctx.deltaFiles.length,
      childCount: Object.keys(ctx.childMetas).length,
      crossRefCount: Object.keys(ctx.crossRefMetas).length,
    },
  };
}

/**
 * Compile a string as a Handlebars template with the given context.
 * Returns the original string unchanged if compilation fails.
 */
function compileTemplate(text: string, context: TemplateContext): string {
  try {
    return Handlebars.compile(text, { noEscape: true })(context);
  } catch {
    return text;
  }
}

/** Append a keyed record of meta outputs as subsections, if non-empty. */
function appendMetaSections(
  sections: string[],
  heading: string,
  metas: Record<string, unknown>,
): void {
  if (Object.keys(metas).length === 0) return;
  sections.push('', heading);
  for (const [path, content] of Object.entries(metas)) {
    sections.push(
      `### ${path}`,
      typeof content === 'string' ? content : '(not yet synthesized)',
    );
  }
}

/** Append optional context sections shared across all step prompts. */
function appendSharedSections(
  sections: string[],
  ctx: MetaContext,
  options?: {
    includeSteer?: boolean;
    includePreviousContent?: boolean;
    includePreviousFeedback?: boolean;
    feedbackHeading?: string;
    includeChildMetas?: boolean;
    includeCrossRefs?: boolean;
  },
): void {
  const opts = {
    includeSteer: true,
    includePreviousContent: true,
    includePreviousFeedback: true,
    feedbackHeading: '## PREVIOUS FEEDBACK',
    includeChildMetas: true,
    includeCrossRefs: true,
    ...options,
  };

  if (opts.includeSteer && ctx.steer) {
    sections.push('', '## STEERING PROMPT', ctx.steer);
  }

  if (opts.includePreviousContent && ctx.previousContent) {
    sections.push('', '## PREVIOUS SYNTHESIS', ctx.previousContent);
  }

  if (opts.includePreviousFeedback && ctx.previousFeedback) {
    sections.push('', opts.feedbackHeading, ctx.previousFeedback);
  }

  if (opts.includeChildMetas) {
    appendMetaSections(sections, '## CHILD META OUTPUTS', ctx.childMetas);
  }

  if (opts.includeCrossRefs) {
    appendMetaSections(
      sections,
      '## CROSS-REFERENCED METAS',
      ctx.crossRefMetas,
    );
  }
}

/**
 * Build the architect task prompt.
 *
 * @param ctx - Synthesis context.
 * @param meta - Current meta.json.
 * @param config - Synthesis config.
 * @returns The architect task prompt string.
 */
export function buildArchitectTask(
  ctx: MetaContext,
  meta: MetaJson,
  config: MetaConfig,
): string {
  const sections = [
    meta._architect ?? config.defaultArchitect ?? DEFAULT_ARCHITECT_PROMPT,
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Total files in scope: ${ctx.scopeFiles.length.toString()}`,
    `Files changed since last synthesis: ${ctx.deltaFiles.length.toString()}`,
    '',
    '### File listing (scope)',
    condenseScopeFiles(ctx.scopeFiles),
  ];

  // Inject previous _builder so architect can see its own prior output
  if (meta._builder) {
    sections.push('', '## PREVIOUS TASK BRIEF', meta._builder);
  }

  appendSharedSections(sections, ctx);

  if (ctx.archives.length > 0) {
    sections.push(
      '',
      '## ARCHIVE HISTORY',
      `${ctx.archives.length.toString()} previous synthesis snapshots available in .meta/archive/.`,
      'Review these to understand how the synthesis has evolved over time.',
    );
  }

  return compileTemplate(
    sections.join('\n'),
    buildTemplateContext(ctx, meta, config),
  );
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
  ctx: MetaContext,
  meta: MetaJson,
  config: MetaConfig,
): string {
  const sections = [
    '## TASK BRIEF (from Architect)',
    meta._builder ?? '(No architect brief available)',
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Delta files (${ctx.deltaFiles.length.toString()} changed):`,
    ...ctx.deltaFiles.slice(0, config.maxLines).map((f) => `- ${f}`),
  ];

  if (ctx.previousState != null) {
    sections.push(
      '',
      '## PREVIOUS STATE',
      'The following opaque state was returned by the previous synthesis cycle.',
      'Use it to continue progressive work. Update `_state` in your output to',
      'reflect your progress.',
      '',
      '```json',
      JSON.stringify(ctx.previousState, null, 2),
      '```',
    );
  }

  appendSharedSections(sections, ctx, {
    includeSteer: false,
    feedbackHeading: '## FEEDBACK FROM CRITIC',
  });

  sections.push(
    '',
    '## OUTPUT FORMAT',
    '',
    'Respond with ONLY a JSON object. No explanation, no markdown fences, no text before or after.',
    '',
    'Required schema:',
    '{',
    '  "type": "object",',
    '  "required": ["_content"],',
    '  "properties": {',
    '    "_content": { "type": "string", "description": "Markdown narrative synthesis" },',
    '    "_state": { "description": "Opaque state object for progressive work across cycles" }',
    '  },',
    '  "additionalProperties": true',
    '}',
    '',
    'Add any structured fields that capture important facts about this entity',
    '(e.g. status, risks, dependencies, metrics). Use descriptive key names without underscore prefix.',
    'The _content field is the only required key — everything else is domain-driven.',
    '_state is optional: set it to carry state across synthesis cycles for progressive work.',
    '',
    'DIAGRAMS: When diagrams would aid understanding, use PlantUML in fenced code blocks (```plantuml).',
    'PlantUML is rendered natively by the serving infrastructure. NEVER use ASCII art diagrams.',
  );

  return compileTemplate(
    sections.join('\n'),
    buildTemplateContext(ctx, meta, config),
  );
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
  ctx: MetaContext,
  meta: MetaJson,
  config: MetaConfig,
): string {
  const sections = [
    meta._critic ?? config.defaultCritic ?? DEFAULT_CRITIC_PROMPT,
    '',
    '## SYNTHESIS TO EVALUATE',
    meta._content ?? '(No content produced)',
    '',
    '## SCOPE',
    `Path: ${ctx.path}`,
    `Files in scope: ${ctx.scopeFiles.length.toString()}`,
  ];

  appendSharedSections(sections, ctx, {
    includePreviousContent: false,
    feedbackHeading: '## YOUR PREVIOUS FEEDBACK',
    includeChildMetas: false,
    includeCrossRefs: false,
  });

  sections.push(
    '',
    '## OUTPUT FORMAT',
    'Return your evaluation as Markdown text. Be specific and actionable.',
  );

  return compileTemplate(
    sections.join('\n'),
    buildTemplateContext(ctx, meta, config),
  );
}
