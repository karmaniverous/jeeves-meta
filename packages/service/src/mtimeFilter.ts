/**
 * Filter file paths by modification time.
 *
 * Shared utility for staleness detection and delta file enumeration.
 * Uses `fs.statSync` for fast local mtime checks on known paths.
 *
 * @module mtimeFilter
 */

import { statSync } from 'node:fs';

/**
 * Check if any file in the list was modified after the given timestamp.
 *
 * Short-circuits on first match for efficiency (staleness checks).
 *
 * @param files - Array of file paths to check.
 * @param afterMs - Timestamp in milliseconds. Files with `mtimeMs > afterMs` match.
 * @returns True if any file was modified after the timestamp.
 */
export function hasModifiedAfter(files: string[], afterMs: number): boolean {
  for (const filePath of files) {
    try {
      if (statSync(filePath).mtimeMs > afterMs) return true;
    } catch {
      // Unreadable file — skip
    }
  }
  return false;
}

/**
 * Filter files to only those modified after the given timestamp.
 *
 * @param files - Array of file paths to filter.
 * @param afterMs - Timestamp in milliseconds. Files with `mtimeMs > afterMs` are included.
 * @returns Filtered array of file paths.
 */
export function filterModifiedAfter(
  files: string[],
  afterMs: number,
): string[] {
  return files.filter((filePath) => {
    try {
      return statSync(filePath).mtimeMs > afterMs;
    } catch {
      return false;
    }
  });
}
