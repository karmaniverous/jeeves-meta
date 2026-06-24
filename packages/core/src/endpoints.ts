/**
 * Shared endpoint catalog — single source of truth for the jeeves-meta API.
 *
 * Both the CLI service and the OpenClaw plugin derive their registrations
 * from this declarative catalog, eliminating drift between the two.
 *
 */

/** HTTP methods used by the API. */
export type HttpMethod = 'GET' | 'PATCH' | 'POST';

/** Descriptor for a single API endpoint. */
export interface EndpointDescriptor {
  /** Unique endpoint identifier (camelCase). */
  name: string;
  /** HTTP method. */
  method: HttpMethod;
  /** URL path pattern (e.g. '/metas/:path'). */
  path: string;
  /** Human-readable description of the endpoint's purpose. */
  description: string;
}

/**
 * Canonical endpoint catalog for the jeeves-meta API.
 *
 * Every entry describes a single HTTP endpoint exposed by the service.
 * Route handlers, plugin tools, and HTTP clients should reference these
 * descriptors rather than hard-coding paths and descriptions.
 */
export const META_ENDPOINTS = [
  {
    name: 'status',
    method: 'GET',
    path: '/status',
    description: 'Service health and status overview.',
  },
  {
    name: 'listMetas',
    method: 'GET',
    path: '/metas',
    description:
      'List metas with summary stats and per-meta projection. Response includes phaseState and owedPhase per meta.',
  },
  {
    name: 'metaDetail',
    method: 'GET',
    path: '/metas/:path',
    description:
      'Full detail for a single meta, with optional archive history. Response includes phaseState, owedPhase, and crossRefs.',
  },
  {
    name: 'updateMeta',
    method: 'PATCH',
    path: '/metas/:path',
    description:
      'Update user-settable reserved properties on a meta entity. Returns the updated meta.json content. Rejects unknown property keys with a 400 error.',
  },
  {
    name: 'synthesize',
    method: 'POST',
    path: '/synthesize',
    description:
      'Trigger synthesis. Path-targeted creates an override queue entry; returns owedPhase. Fully-fresh metas return status:skipped.',
  },
  {
    name: 'abort',
    method: 'POST',
    path: '/synthesize/abort',
    description: 'Abort the currently running synthesis.',
  },
  {
    name: 'preview',
    method: 'GET',
    path: '/preview',
    description:
      'Dry-run preview of next synthesis. Returns owedPhase, priorityBand, phaseState, inputStatus, and architectInvalidators.',
  },
  {
    name: 'seed',
    method: 'POST',
    path: '/seed',
    description:
      'Create a .meta/ directory and initial meta.json for a new entity path.',
  },
  {
    name: 'unlock',
    method: 'POST',
    path: '/unlock',
    description: 'Remove a stale .lock from a meta entity that is stuck.',
  },
  {
    name: 'config',
    method: 'GET',
    path: '/config',
    description: 'Query service configuration with optional JSONPath.',
  },
  {
    name: 'configApply',
    method: 'POST',
    path: '/config/apply',
    description: 'Apply a configuration patch.',
  },
  {
    name: 'queue',
    method: 'GET',
    path: '/queue',
    description:
      'List queued synthesis operations (3-layer model: current, overrides, automatic).',
  },
  {
    name: 'queueClear',
    method: 'POST',
    path: '/queue/clear',
    description: 'Clear override entries from the queue.',
  },
] as const satisfies readonly EndpointDescriptor[];

/** Union of all endpoint names. */
export type EndpointName = (typeof META_ENDPOINTS)[number]['name'];

/** Single entry from the catalog, narrowed by name. */
export type Endpoint<N extends EndpointName> = Extract<
  (typeof META_ENDPOINTS)[number],
  { name: N }
>;

/**
 * Look up an endpoint descriptor by name.
 *
 * @param name - The endpoint identifier.
 * @returns The matching {@link EndpointDescriptor}.
 */
export function getEndpoint<N extends EndpointName>(name: N): Endpoint<N> {
  const ep = META_ENDPOINTS.find((e) => e.name === name);
  if (!ep) throw new Error(`Unknown endpoint: ${name}`);
  return ep as Endpoint<N>;
}
