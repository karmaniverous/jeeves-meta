/**
 * Format a plugin manifest object as Prettier-formatted JSON.
 *
 * @param manifest - Parsed manifest object.
 * @param filepath - Absolute path of the manifest (used to resolve the
 *   Prettier config).
 * @returns Formatted JSON with a trailing newline.
 */
export declare function formatPluginManifest(
  manifest: unknown,
  filepath: string,
): Promise<string>;
