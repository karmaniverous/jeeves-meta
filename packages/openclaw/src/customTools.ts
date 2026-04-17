/**
 * Custom domain-specific tool descriptors for the meta plugin.
 *
 * These tools supplement the standard factory-produced tools
 * (meta_status, meta_config, meta_config_apply, meta_service).
 *
 * @module customTools
 */

import {
  connectionFail,
  ok,
  type ToolDescriptor,
  type ToolResult,
} from '@karmaniverous/jeeves';

import { PLUGIN_ID } from './constants.js';
import type { MetaServiceClient } from './serviceClient.js';

/** Build the array of custom domain-specific tool descriptors. */
export function buildCustomTools(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor[] {
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

/** Wrap tool execution with connection error handling. */
function wrap(
  baseUrl: string,
  fn: () => Promise<unknown>,
): Promise<ToolResult> {
  return fn()
    .then(ok)
    .catch((error: unknown) => connectionFail(error, baseUrl, PLUGIN_ID));
}

function buildMetaListTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_list',
    description:
      'List metas with summary stats and per-meta projection. Response includes _phaseState and owedPhase per meta.',
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
          pathPrefix: params.pathPrefix as string | undefined,
          hasError: filter?.hasError as boolean | undefined,
          staleHours: filter?.staleHours as number | undefined,
          neverSynthesized: filter?.neverSynthesized as boolean | undefined,
          locked: filter?.locked as boolean | undefined,
          disabled: filter?.disabled as boolean | undefined,
          fields: params.fields as string[] | undefined,
        }),
      );
    },
  };
}

function buildMetaDetailTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_detail',
    description:
      'Full detail for a single meta, with optional archive history. Response includes _phaseState and owedPhase.',
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
        client.detail(params.path as string, {
          includeArchive: params.includeArchive as boolean | number | undefined,
          fields: params.fields as string[] | undefined,
        }),
      ),
  };
}

function buildMetaPreviewTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_preview',
    description:
      'Dry-run preview of next synthesis. Returns owedPhase, priorityBand, phaseState, stalenessInputs, and architectInvalidators.',
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
      wrap(baseUrl, () => client.preview(params.path as string | undefined)),
  };
}

function buildMetaTriggerTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_trigger',
    description:
      'Trigger synthesis. Path-targeted creates an override queue entry; returns owedPhase. Fully-fresh metas return status:skipped.',
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
      wrap(baseUrl, () => client.synthesize(params.path as string | undefined)),
  };
}

function buildMetaSeedTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_seed',
    description:
      'Create a .meta/ directory and initial meta.json for a new entity path.',
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
            'JSON array of cross-ref owner paths (e.g. \'["j:/path/a","j:/path/b"]\').',
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
        client.seed(params.path as string, crossRefs, steer),
      );
    },
  };
}

function buildMetaUnlockTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_unlock',
    description: 'Remove a stale .lock from a meta entity that is stuck.',
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
      wrap(baseUrl, () => client.unlock(params.path as string)),
  };
}

function buildMetaQueueTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_queue',
    description:
      'Queue management. list: 3-layer model (current with phase, overrides, automatic, pending). clear: removes overrides only. abort: returns {status,path,phase} or {status:idle}.',
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
          return wrap(baseUrl, () => client.clearQueue());
        case 'abort':
          return wrap(baseUrl, () => client.abort());
        default:
          return ok({ error: `Unknown action: ${action}` });
      }
    },
  };
}

function buildMetaUpdateTool(
  client: MetaServiceClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_update',
    description: 'Update user-settable reserved properties on a meta entity.',
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
        client.update(
          params.path as string,
          params.updates as Parameters<MetaServiceClient['update']>[1],
        ),
      ),
  };
}
