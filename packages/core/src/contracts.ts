/**
 * Shared HTTP response contracts between service and plugin.
 *
 * These types define the shape of responses from the jeeves-meta service
 * HTTP API, consumed by both the service route handlers and the OpenClaw
 * plugin client.
 *
 */

import type { PhaseName, PhaseStatus } from './phases.js';

/** Summary statistics from GET /metas. */
export interface MetaListSummary {
  total: number;
  stale: number;
  errors: number;
  locked: number;
  disabled: number;
  neverSynthesized: number;
  tokens: { architect: number; builder: number; critic: number };
  stalestPath: string | null;
  lastSynthesizedPath: string | null;
  lastSynthesizedAt: string | null;
}

/** Per-meta item in the GET /metas response (projected). */
export interface MetasItem {
  stalenessSeconds: number | null;
  [key: string]: unknown;
}

/** GET /metas response envelope. */
export interface MetasResponse {
  summary: MetaListSummary;
  metas: MetasItem[];
}

/** Dependency health in GET /status response. */
export interface DepHealth {
  url: string;
  status: string;
  checkedAt: string | null;
}

/** Watcher dependency health (extends DepHealth). */
export interface WatcherDepHealth extends DepHealth {
  rulesRegistered?: boolean;
  indexing?: boolean;
}

/** Gateway dependency health. */
export type GatewayDepHealth = DepHealth;

/** Service lifecycle state. */
export type ServiceState = 'idle' | 'synthesizing' | 'waiting' | 'stopping';

/** Phase state summary: per-phase counts of each status. */
export type PhaseStateSummary = Record<PhaseName, Record<PhaseStatus, number>>;

/** Next phase candidate from the scheduler. */
export interface NextPhaseCandidate {
  path: string;
  phase: PhaseName;
  band: number;
  staleness: number;
}
