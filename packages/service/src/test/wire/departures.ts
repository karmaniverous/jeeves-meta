/**
 * @module test/wire/departures
 * The closed list of approved wire departures from the 0.19.0 baseline
 * (spec 4.4.2, Decision 184): each departing scenario, what 0.19.0
 * answered, and the spec item that allows the change. Pure data. T2 adds
 * the bodies jeeves 0.11.0's config handlers now send; the catalog
 * departures follow in T6/T7.
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
  {
    // jeeves 0.11.0 config handlers: same status, standard body (T2).
    'config invalid jsonpath': {
      before: '400 { error: <JSONPath parser message> } from jeeves 0.8',
      item: 'error-body',
      code: 'JEEVES_CONFIG_QUERY_INVALID',
    },
    'configApply invalid config': {
      before:
        "400 { error: 'Config validation failed', issues } from jeeves 0.8",
      item: 'error-body',
      code: 'JEEVES_CONFIG_INVALID',
    },
  };
