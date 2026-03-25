/**
 * Escape special glob characters in a path so it can be used as a literal
 * prefix in glob patterns.
 *
 * Glob metacharacters `* ? [ ] { } ( ) !` are escaped with a backslash so
 * that paths containing parentheses (e.g. Slack channel IDs) or other
 * special characters are matched literally by the watcher's walk endpoint.
 *
 * @module escapeGlob
 */

/**
 * Escape glob metacharacters in a string using character-class wrapping.
 *
 * Backslash escaping (`\(`) does not work reliably on Windows where `\` is
 * the path separator. Instead, each metacharacter is wrapped in a character
 * class (e.g. `(` → `[(]`) which is universally supported by glob libraries.
 *
 * Square brackets themselves are escaped as `[[]` and `[]]`.
 *
 * @param s - Raw path string.
 * @returns String with glob metacharacters wrapped in character classes.
 */
export function escapeGlob(s: string): string {
  return s.replace(/[*?[\]{}()!]/g, (ch) => `[${ch}]`);
}
