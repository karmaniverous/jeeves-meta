/**
 * Custom domain-specific tool descriptors for the meta plugin.
 *
 * These tools supplement the standard factory-produced tools
 * (meta_status, meta_config, meta_config_apply, meta_service). Each calls
 * its catalog entry through the SDK (Decision 187); descriptions come from
 * `META_CATALOG`; input schemas stay hand-written (Decision 188).
 *
 * @module customTools
 */

import { ok, type ToolDescriptor } from '@karmaniverous/jeeves';
import {
  createMetaClient,
  type MetaClient,
} from '@karmaniverous/jeeves-meta-sdk';

import { entryDescription, flag, list, str, wrap } from './toolHelpers.js';
import {
  buildMetaSeedTool,
  buildMetaTriggerTool,
  buildMetaUnlockTool,
  buildMetaUpdateTool,
} from './writeTools.js';

/** Build the array of custom domain-specific tool descriptors. */
export function buildCustomTools(baseUrl: string): ToolDescriptor[] {
  const client = createMetaClient({ baseUrl });
  return [
    buildMetaListTool(client, baseUrl),
    buildMetaDetailTool(client, baseUrl),
    buildMetaPreviewTool(client, baseUrl),
    buildMetaTriggerTool(client, baseUrl),
    buildMetaSeedTool(client, baseUrl),
    buildMetaUnlockTool(client, baseUrl),
    buildMetaQueueTool(client, baseUrl),
    buildMetaUpdateTool(client, baseUrl),
  ];
}

function buildMetaListTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_list',
    description: entryDescription('listMetas'),
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
            'Structured filter. Supported keys: hasError (boolean), staleHours (number), neverSynthesized (boolean), locked (boolean), disabled (boolean).',
          properties: {
            hasError: { type: 'boolean' },
            staleHours: { type: 'number' },
            neverSynthesized: { type: 'boolean' },
            locked: { type: 'boolean' },
            disabled: { type: 'boolean' },
          },
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include per meta.',
        },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      const filter = params.filter as Record<string, unknown> | undefined;
      return wrap(baseUrl, () =>
        client.listMetas({
          pathPrefix: (params.pathPrefix as string | undefined) || undefined,
          hasError: flag(filter?.hasError),
          staleHours: str(filter?.staleHours),
          neverSynthesized: flag(filter?.neverSynthesized),
          locked: flag(filter?.locked),
          disabled: flag(filter?.disabled),
          fields: list(params.fields),
        }),
      );
    },
  };
}

function buildMetaDetailTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_detail',
    description: entryDescription('metaDetail'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to .meta/ directory or owner directory.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include.',
        },
        includeArchive: {
          oneOf: [{ type: 'boolean' }, { type: 'number' }],
          description:
            'false (default), true (all snapshots), or number (N most recent).',
        },
      },
      required: ['path'],
    },
    execute: async (_id: string, params: Record<string, unknown>) =>
      wrap(baseUrl, () =>
        client.metaDetail({
          path: params.path as string,
          includeArchive: str(params.includeArchive),
          fields: list(params.fields),
        }),
      ),
  };
}

function buildMetaPreviewTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_preview',
    description: entryDescription('preview'),
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
    execute: async (_id: string, params: Record<string, unknown>) =>
      wrap(baseUrl, () =>
        client.preview(params.path ? { path: params.path as string } : {}),
      ),
  };
}

function buildMetaQueueTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_queue',
    description: `Queue management. list: ${entryDescription('queue')} clear: ${entryDescription('queueClear')} abort: ${entryDescription('abort')}`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'clear', 'abort'],
          description:
            'Queue action: list (show state), clear (remove pending), abort (stop current synthesis).',
        },
      },
      required: ['action'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      const action = params.action as string;
      switch (action) {
        case 'list':
          return wrap(baseUrl, () => client.queue());
        case 'clear':
          return wrap(baseUrl, () => client.queueClear());
        case 'abort':
          return wrap(baseUrl, () => client.abort());
        default:
          return ok({ error: `Unknown action: ${action}` });
      }
    },
  };
}
