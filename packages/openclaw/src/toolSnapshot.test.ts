/**
 * @module toolSnapshot.test
 * The registered tools against plugin 0.16.0 (spec 4.4.7): the same tool
 * names, and each tool's description and input schema unchanged, so agents
 * see the same tools. `tools-0.16.0.json` was captured from the published
 * `@karmaniverous/jeeves-meta-openclaw@0.16.0` with the same fake API.
 * The standard tools come from jeeves' `createPluginToolset`; their input
 * schemas changed with jeeves 0.11.0 (T2), as listed in `JEEVES_0_11`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import register from './index.js';

interface ToolShape {
  name: string;
  description: string;
  parameters: unknown;
}

const before = JSON.parse(
  readFileSync(new URL('./tools-0.16.0.json', import.meta.url), 'utf8'),
) as ToolShape[];

/** Every tool the plugin registers, as name, description and schema. */
function registered(): ToolShape[] {
  const tools: ToolShape[] = [];
  register({
    config: {},
    pluginConfig: {},
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    registerTool: (tool: ToolShape) => {
      tools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      });
    },
    resolvePath: (p: string) => p,
  } as never);
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

const now = registered();

/** Standard-tool input schemas as jeeves 0.11.0 emits them. */
const JEEVES_0_11: Readonly<Record<string, unknown>> = {
  meta_status: { type: 'object', properties: {}, additionalProperties: false },
  meta_config: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'JSONPath expression (optional)' },
    },
    additionalProperties: false,
  },
  meta_config_apply: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        propertyNames: { type: 'string' },
        additionalProperties: {},
        description: 'Config patch to apply',
      },
      replace: {
        type: 'boolean',
        description: 'Replace the whole config instead of merging',
      },
    },
    required: ['config'],
    additionalProperties: false,
  },
};

describe('tools against 0.16.0', () => {
  it('registers the same tool names', () => {
    expect(now.map((t) => t.name)).toEqual(before.map((t) => t.name));
  });

  it.each(before.map((t) => [t.name, t] as const))(
    '%s keeps its description and input schema (standard tools: jeeves 0.11.0)',
    (name, old) => {
      const expected =
        name in JEEVES_0_11 ? { ...old, parameters: JEEVES_0_11[name] } : old;
      expect(now.find((t) => t.name === name)).toEqual(expected);
    },
  );
});
