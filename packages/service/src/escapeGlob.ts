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
 * Escape glob metacharacters in a string.
 *
 * @param s - Raw path string.
 * @returns String with glob metacharacters backslash-escaped.
 */
export function escapeGlob(s: string): string {
  return s.replace(/[*?[\]{}()!]/g, '\\$&');
}
