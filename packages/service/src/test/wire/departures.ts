/**
 * @module test/wire/departures
 * The closed list of approved wire departures from the 0.19.0 baseline
 * (spec 4.4.2, Decision 184): each departing scenario, what 0.19.0
 * answered, the status and code it answers now, and the spec item that
 * allows the change. Pure data.
 */

/**
 * The spec item a departure falls under.
 *
 * - `error-body`: an error reply in Fastify's standard body (4.4.4).
 * - `validation`: a request that fails its catalog schema (4.4.3).
 * - `decode`: a `:path` decoded once (Decision 202).
 * - `readiness`: a route matched as ungated during start-up (Decision 199).
 * - `watcher`: `GET /metas` with the watcher down (Decision 216).
 */
export type DepartureItem =
  'error-body' | 'validation' | 'decode' | 'readiness' | 'watcher';

/** One approved departure. */
export interface WireDeparture {
  /** What 0.19.0 answered, and why. */
  before: string;
  /** The spec item that allows it. */
  item: DepartureItem;
  /** The status it answers now. */
  status: number;
  /** The `code` of the new error body (error statuses only). */
  code?: string;
}

/** A departure to Fastify's request-validation 400. */
const validation = (before: string): WireDeparture => ({
  before,
  item: 'validation',
  status: 400,
  code: 'FST_ERR_VALIDATION',
});

/** A departure to the standard body, same status, meta's code. */
const errorBody = (
  before: string,
  status: number,
  code: string,
): WireDeparture => ({ before, item: 'error-body', status, code });

const notReady = errorBody(
  "503 { status: 'starting', message }",
  503,
  'META_NOT_READY',
);
const malformed = '500 INTERNAL_ERROR with the Zod message';

/** Approved departures by scenario name. */
export const WIRE_DEPARTURES: Readonly<Partial<Record<string, WireDeparture>>> =
  {
    // jeeves 0.11.0 config handler: same status, standard body (T2).
    'configApply invalid config': errorBody(
      "400 { error: 'Config validation failed', issues } from jeeves 0.8",
      400,
      'JEEVES_CONFIG_INVALID',
    ),
    // Meta's own errors (4.4.4).
    'config invalid jsonpath': errorBody(
      '400 { error: <JSONPath parser message> } from jeeves 0.8',
      400,
      'META_INVALID_JSONPATH',
    ),
    'status not ready': notReady,
    'listMetas not ready': notReady,
    'metaDetail unknown meta': errorBody(
      '404 NOT_FOUND',
      404,
      'META_NOT_FOUND',
    ),
    'updateMeta unknown meta': errorBody(
      '404 NOT_FOUND',
      404,
      'META_NOT_FOUND',
    ),
    'preview unknown meta': errorBody('404 NOT_FOUND', 404, 'META_NOT_FOUND'),
    'synthesize watcher unreachable': errorBody(
      '503 SERVICE_UNAVAILABLE',
      503,
      'META_WATCHER_UNAVAILABLE',
    ),
    'preview watcher unreachable': errorBody(
      '503 SERVICE_UNAVAILABLE',
      503,
      'META_WATCHER_UNAVAILABLE',
    ),
    'seed conflict': errorBody('409 CONFLICT', 409, 'META_ALREADY_EXISTS'),
    'unlock not locked': errorBody(
      '409 ALREADY_UNLOCKED',
      409,
      'META_NOT_LOCKED',
    ),
    // Catalog request validation (4.4.3).
    'listMetas malformed staleHours': validation(malformed),
    'metaDetail malformed includeArchive': validation(malformed),
    'synthesize malformed body': validation(malformed),
    'seed malformed body': validation(malformed),
    'unlock malformed body': validation(malformed),
    'updateMeta invalid body': validation('400 BAD_REQUEST'),
    'updateMeta engine key': validation('400 BAD_REQUEST'),
    'configApply empty body': validation('400 { error: <reason> }'),
    'configApply non-object patch': validation('400 { error: <reason> }'),
    'configApply non-boolean replace': validation('400 { error: <reason> }'),
    'configApply no body': validation('400 { error: <reason> }'),
    // Decisions 202, 199, 216.
    'metaDetail percent path': {
      before: '500 URI malformed: the handler decoded :path a second time',
      item: 'decode',
      status: 200,
    },
    'config jsonpath not ready': {
      before: '503 starting: the gate matched the raw URL, not the route',
      item: 'readiness',
      status: 200,
    },
    'listMetas watcher unreachable': {
      before: '500 INTERNAL_ERROR with the raw cause',
      item: 'watcher',
      status: 503,
      code: 'META_WATCHER_UNAVAILABLE',
    },
  };
