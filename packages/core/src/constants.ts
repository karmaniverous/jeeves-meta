/**
 * Shared component descriptor constants for jeeves-meta.
 *
 * Single source of truth consumed by both the service descriptor and
 * the OpenClaw plugin registration.
 */

/** Shared jeeves-meta component descriptor constants. */
export const META_COMPONENT = {
  name: 'meta',
  servicePackage: '@karmaniverous/jeeves-meta',
  pluginPackage: '@karmaniverous/jeeves-meta-openclaw',
  defaultPort: 1938,
  configFileName: 'config.json',
} as const;
