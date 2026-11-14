/**
 * JSON-safe numbers: `Infinity` and `NaN` (a never-synthesized meta's
 * staleness) become `null`, which is what `JSON.stringify` sent for them
 * before responses were validated. Pure.
 *
 * @module finiteOrNull
 */

/**
 * A finite number as is, anything else as `null`.
 *
 * @param value - The number.
 * @returns It, or `null` when not finite.
 */
export function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
