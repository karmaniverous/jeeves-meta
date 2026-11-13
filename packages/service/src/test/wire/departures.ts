/**
 * @module test/wire/departures
 * The closed list of approved wire departures from the 0.19.0 baseline
 * (spec 4.4.2, Decision 184): each departing scenario, what 0.19.0
 * answered, and the spec item that allows the change. Pure data. Empty
 * until the catalog lands (T6/T7).
 */

/**
 * The 4.4.2 item a departure falls under.
 *
 * - `error-body`: an error reply in Fastify's standard body (4.4.4).
 * - `validation`: a request that fails its catalog schema (4.4.3).
 * - `decode`: a `:path` decoded once (Decision 202).
 */
export type DepartureItem = 'error-body' | 'validation' | 'decode';

/** One approved departure. */
export interface WireDeparture {
  /** What 0.19.0 answered, and why. */
  before: string;
  /** The 4.4.2 item that allows it. */
  item: DepartureItem;
  /** The `code` the new body carries, if any. */
  code?: string;
}

/** Approved departures by scenario name. */
export const WIRE_DEPARTURES: Readonly<Partial<Record<string, WireDeparture>>> =
  {};
