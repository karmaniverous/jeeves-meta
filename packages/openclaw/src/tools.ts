/**
 * Meta tool registrations for OpenClaw.
 *
 * All tools delegate to the jeeves-meta HTTP service.
 * Tool names and descriptions are sourced from {@link META_TOOLS}.
 *
 * @module tools
 */

import {
  connectionFail,
  ok,
  type PluginApi,
  type ToolResult,
} from '@karmaniverous/jeeves';

import type { MetaServiceClient } from './serviceClient.js';
import { META_TOOLS } from './toolMeta.js';

/** Plugin identifier for connection error guidance. */
const PLUGIN_ID = 'jeeves-meta-openclaw';

/** Look up a tool's description by name. */
function desc(name: string): string {
  return META_TOOLS.find((t) => t.name === name)?.description ?? name;
}

/** Register all meta_* tools. */
export function registerMetaTools(
  api: PluginApi,
  client: MetaServiceClient,
): void {
  const baseUrl = client.getBaseUrl();

  // ─── meta_list ──────────────────────────────────────────────
  api.registerTool({
    name: 'meta_list',
    description: desc('meta_list'),
    parameters: {
      type: 'object',
      properties: {
        pathPrefix: {
          type: 'string',
          description: 'Filter metas by path prefix (e.g. "github/").',
        },
        filter: {
          type: 'object',
          description:
            'Structured filter. Supported keys: hasError (boolean), staleHours (number, min hours stale), neverSynthesized (boolean), locked (boolean).',
          properties: {
            hasError: { type: 'boolean' },
            staleHours: { type: 'number' },
            neverSynthesized: { type: 'boolean' },
            locked: { type: 'boolean' },
          },
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Fields to include per meta. Default: path, depth, emphasis, stalenessSeconds, lastSynthesized, hasError, locked, architectTokens, builderTokens, criticTokens.',
        },
      },
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const filter = params.filter as Record<string, unknown> | undefined;
        const data = await client.listMetas({
          pathPrefix: params.pathPrefix as string | undefined,
          hasError: filter?.hasError as boolean | undefined,
          staleHours: filter?.staleHours as number | undefined,
          neverSynthesized: filter?.neverSynthesized as boolean | undefined,
          locked: filter?.locked as boolean | undefined,
          fields: params.fields as string[] | undefined,
        });
        return ok(data);
      } catch (error) {
        return connectionFail(error, baseUrl, PLUGIN_ID);
      }
    },
  });

  // ─── meta_detail ────────────────────────────────────────────
  api.registerTool({
    name: 'meta_detail',
    description: desc('meta_detail'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Path to .meta/ directory or owner directory (required).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Fields to include. Default: all except _architect, _builder, _critic, _content, _feedback.',
        },
        includeArchive: {
          oneOf: [{ type: 'boolean' }, { type: 'number' }],
          description:
            'false (default), true (all snapshots), or number (N most recent).',
        },
      },
      required: ['path'],
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const data = await client.detail(params.path as string, {
          includeArchive: params.includeArchive as boolean | number | undefined,
          fields: params.fields as string[] | undefined,
        });
        return ok(data);
      } catch (error) {
        return connectionFail(error, baseUrl, PLUGIN_ID);
      }
    },
  });

  // ─── meta_preview ────────────────────────────────────────────
  api.registerTool({
    name: 'meta_preview',
    description: desc('meta_preview'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional: specific .meta/ path to preview. If omitted, previews the stalest candidate.',
        },
      },
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const data = await client.preview(params.path as string | undefined);
        return ok(data);
      } catch (error) {
        return connectionFail(error, baseUrl, PLUGIN_ID);
      }
    },
  });

  // ─── meta_trigger ────────────────────────────────────────────
  api.registerTool({
    name: 'meta_trigger',
    description: desc('meta_trigger'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Optional: specific .meta/ or owner path to synthesize. If omitted, synthesizes the stalest candidate.',
        },
      },
    },
    execute: async (
      _id: string,
      params: Record<string, unknown>,
    ): Promise<ToolResult> => {
      try {
        const data = await client.synthesize(params.path as string | undefined);
        return ok(data);
      } catch (error) {
        return connectionFail(error, baseUrl, PLUGIN_ID);
      }
    },
  });
}
