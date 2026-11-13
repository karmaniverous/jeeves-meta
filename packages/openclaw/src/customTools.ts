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

import {
  ok,
  type ToolDescriptor,
  type ToolResult,
} from '@karmaniverous/jeeves';
import {
  META_CATALOG,
  type MetaEntryName,
} from '@karmaniverous/jeeves-meta-core';
import {
  createMetaClient,
  type MetaClient,
  type MetaInput,
} from '@karmaniverous/jeeves-meta-sdk';

import { toolError } from './toolError.js';

/** A catalog entry's description. */
function describe(name: MetaEntryName): string {
  const entry = META_CATALOG.entries.find((e) => e.name === name);
  return entry?.description ?? '';
}

/** A number or boolean as a query string; anything else stays absent. */
const str = (value: unknown): string | undefined =>
  typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;

/** A boolean filter as its query flag; undefined stays absent. */
const flag = (value: unknown): 'true' | 'false' | undefined =>
  value === undefined ? undefined : value ? 'true' : 'false';

/** A field list as the comma-separated query value. */
const list = (value: unknown): string | undefined =>
  Array.isArray(value) && value.length > 0 ? value.join(',') : undefined;

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

/** Run a call: its result, or the 0.16.0-worded error (`toolError`). */
function wrap(
  baseUrl: string,
  fn: () => Promise<unknown>,
): Promise<ToolResult> {
  return fn()
    .then(ok)
    .catch((error: unknown) => toolError(error, baseUrl));
}

function buildMetaListTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_list',
    description: describe('listMetas'),
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
    description: describe('metaDetail'),
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
    description: describe('preview'),
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

function buildMetaTriggerTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_trigger',
    description: describe('synthesize'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional: specific .meta/ or owner path to synthesize.',
        },
      },
    },
    execute: async (_id: string, params: Record<string, unknown>) =>
      wrap(baseUrl, () =>
        client.synthesize(params.path ? { path: params.path as string } : {}),
      ),
  };
}

function buildMetaSeedTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_seed',
    description: describe('seed'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Owner directory path to seed with .meta/ and meta.json.',
        },
        crossRefs: {
          type: 'string',
          description:
            'JSON array of cross-ref owner paths (e.g. \'["<drive label>:/path/a","<drive label>:/path/b"]\'). Use server_drives to discover available drive labels.',
        },
        steer: {
          type: 'string',
          description:
            'Steering prompt written as _steer in the initial meta.json.',
        },
      },
      required: ['path'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      let crossRefs: string[] | undefined;
      if (typeof params.crossRefs === 'string' && params.crossRefs) {
        try {
          crossRefs = JSON.parse(params.crossRefs) as string[];
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return ok({
            error: 'Invalid JSON in crossRefs parameter.',
            details: message,
          });
        }
      }
      const steer =
        typeof params.steer === 'string' && params.steer
          ? params.steer
          : undefined;
      return wrap(baseUrl, () =>
        client.seed({ path: params.path as string, crossRefs, steer }),
      );
    },
  };
}

function buildMetaUnlockTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_unlock',
    description: describe('unlock'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the .meta/ directory or owner directory.',
        },
      },
      required: ['path'],
    },
    execute: async (_id: string, params: Record<string, unknown>) =>
      wrap(baseUrl, () => client.unlock({ path: params.path as string })),
  };
}

function buildMetaQueueTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_queue',
    description: `Queue management. list: ${describe('queue')} clear: ${describe('queueClear')} abort: ${describe('abort')}`,
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

function buildMetaUpdateTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_update',
    description: describe('updateMeta'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the .meta/ directory or owner directory.',
        },
        updates: {
          type: 'object',
          description:
            'Properties to set. Supported: _steer, _emphasis, _depth, _crossRefs, _disabled. Set to null to remove.',
          properties: {
            _steer: { type: ['string', 'null'] },
            _emphasis: { type: ['number', 'null'] },
            _depth: { type: ['number', 'null'] },
            _crossRefs: {
              oneOf: [
                { type: 'array', items: { type: 'string' } },
                { type: 'null' },
              ],
            },
            _disabled: { type: ['boolean', 'null'] },
          },
        },
      },
      required: ['path', 'updates'],
    },
    execute: async (_id: string, params: Record<string, unknown>) =>
      wrap(baseUrl, () =>
        client.updateMeta({
          ...(params.updates as Omit<MetaInput<'updateMeta'>, 'path'>),
          path: params.path as string,
        }),
      ),
  };
}
