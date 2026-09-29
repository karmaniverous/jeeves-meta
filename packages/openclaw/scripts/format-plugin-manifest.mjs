/**
 * Serialises the plugin manifest in the repo's canonical Prettier format.
 *
 * The release hook runs `prettier --write openclaw.plugin.json` after the
 * version bump, so the generator must emit byte-identical output or every
 * build leaves the tree dirty (#222).
 */

import { format, resolveConfig } from 'prettier';

/**
 * Format a plugin manifest object as Prettier-formatted JSON.
 *
 * @param {unknown} manifest - Parsed manifest object.
 * @param {string} filepath - Absolute path of the manifest (used to resolve
 *   the Prettier config).
 * @returns {Promise<string>} Formatted JSON with a trailing newline.
 */
export async function formatPluginManifest(manifest, filepath) {
  const config = (await resolveConfig(filepath)) ?? {};
  return format(JSON.stringify(manifest, null, 2), {
    ...config,
    filepath,
    parser: 'json',
  });
}
