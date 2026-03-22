/**
 * Tool name/description pairs — single source of truth for tool registration
 * and placeholder content.
 *
 * @module toolMeta
 */

/** Metadata for a single meta_* tool. */
interface ToolMeta {
  /** Tool name as registered with OpenClaw. */
  name: string;
  /** Human-readable description. */
  description: string;
}

/** Ordered list of meta_* tools. */
export const META_TOOLS: readonly ToolMeta[] = [
  {
    name: 'meta_list',
    description:
      'List metas with summary stats and per-meta projection. Replaces meta_status + meta_entities.',
  },
  {
    name: 'meta_detail',
    description:
      'Full detail for a single meta, with optional archive history.',
  },
  {
    name: 'meta_trigger',
    description:
      'Manually trigger synthesis for a specific meta or the next-stalest candidate. Runs the full 3-step cycle (architect, builder, critic).',
  },
  {
    name: 'meta_preview',
    description:
      'Dry-run: show what inputs would be gathered for the next synthesis cycle without running LLM.',
  },
  {
    name: 'meta_seed',
    description:
      'Create a .meta/ directory and initial meta.json for a new entity path.',
  },
  {
    name: 'meta_unlock',
    description: 'Remove a stale .lock from a meta entity that is stuck.',
  },
  {
    name: 'meta_config',
    description:
      'Query service configuration with optional JSONPath expression.',
  },
] as const;
