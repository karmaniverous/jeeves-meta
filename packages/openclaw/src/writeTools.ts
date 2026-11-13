/**
 * The custom tools that change state: `meta_trigger`, `meta_seed`,
 * `meta_unlock` and `meta_update`, each calling its catalog entry
 * through the SDK.
 *
 * @module writeTools
 */

import { ok, type ToolDescriptor } from '@karmaniverous/jeeves';
import type { MetaClient, MetaInput } from '@karmaniverous/jeeves-meta-sdk';

import { entryDescription, wrap } from './toolHelpers.js';

export function buildMetaTriggerTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_trigger',
    description: entryDescription('synthesize'),
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

export function buildMetaSeedTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_seed',
    description: entryDescription('seed'),
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

export function buildMetaUnlockTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_unlock',
    description: entryDescription('unlock'),
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

export function buildMetaUpdateTool(
  client: MetaClient,
  baseUrl: string,
): ToolDescriptor {
  return {
    name: 'meta_update',
    description: entryDescription('updateMeta'),
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
