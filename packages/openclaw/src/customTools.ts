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
      'List metas with summary stats and per-meta projection. Replaces meta_status + meta_entities.',
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
            'Structured filter. Supported keys: hasError (boolean), staleHours (number), neverSynthesized (boolean), locked (boolean).',
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
      'Full detail for a single meta, with optional archive history.',
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
      'Dry-run: show what inputs would be gathered for the next synthesis cycle without running LLM.',
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
      'Manually trigger synthesis for a specific meta or the next-stalest candidate.',
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
      },
      required: ['path'],
    },
    execute: async (_id: string, params: Record<string, unknown>) => {
      let crossRefs: string[] | undefined;
      if (typeof params.crossRefs === 'string' && params.crossRefs) {
        crossRefs = JSON.parse(params.crossRefs) as string[];
      }
      return wrap(baseUrl, () => client.seed(params.path as string, crossRefs));
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
      'Queue management: list pending items, clear the queue, or abort current synthesis.',
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
