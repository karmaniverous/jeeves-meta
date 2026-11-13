/**
 * @module api/wireBaseline.test
 * Wire freeze (spec 4.4.2, Decisions 184 and 211): every scenario in
 * `test/wire/scenarios` is replayed through the real server and must match,
 * byte for byte, what 0.19.0 sent (`test/wire/wire-0.19.0.json`), unless
 * the scenario is an approved departure (`test/wire/departures`), whose
 * reply must be Fastify's standard error body with its listed code.
 */

import { readFileSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  WIRE_DEPARTURES,
  type WireDeparture,
} from '../test/wire/departures.js';
import { scenariosFor } from '../test/wire/scenarios.js';
import { startWireApp, type WireApp } from '../test/wire/wireApp.js';
import { runScenario } from '../test/wire/wireRun.js';
import type { WireRecord, WireScenario } from '../test/wire/wireTypes.js';

vi.mock('../configHotReload.js', () => ({
  applyHotReloadedConfig: vi.fn(),
  RESTART_REQUIRED_FIELDS: ['port', 'gatewayApiKey'],
}));

/** What 0.19.0 sent, by scenario name. */
const baseline = JSON.parse(
  readFileSync(
    new URL('../test/wire/wire-0.19.0.json', import.meta.url),
    'utf8',
  ),
) as Record<string, WireRecord>;

const wire: WireApp = await startWireApp();
const scenarios: WireScenario[] = scenariosFor(wire);
const names = scenarios.map((s) => s.name);
const unchanged = scenarios.filter((s) => !(s.name in WIRE_DEPARTURES));
const departing = scenarios.flatMap((s) => {
  const d = WIRE_DEPARTURES[s.name];
  return d === undefined ? [] : [[s.name, s, d] as const];
});

beforeAll(() => {
  wire.reset();
});

afterAll(async () => {
  await wire.close();
});

describe('wire baseline', () => {
  it('has unique scenario names, each recorded, and no stale records', () => {
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(baseline).sort()).toEqual([...names].sort());
  });

  it('lists departures only for known scenarios', () => {
    for (const name of Object.keys(WIRE_DEPARTURES))
      expect(names).toContain(name);
  });

  it.each(unchanged.map((s) => [s.name, s] as const))(
    '%s matches 0.19.0',
    async (name, scenario) => {
      expect(await runScenario(wire, scenario)).toEqual(baseline[name]);
    },
  );
});

describe('approved departures', () => {
  it.each(departing)(
    '%s sends the standard error body',
    async (name, scenario, departure: WireDeparture) => {
      const before = baseline[name];
      const now = await runScenario(wire, scenario);
      expect(now.body).not.toBe(before.body);
      // T7 adds the items that change the status (validation, decode).
      expect(departure.item).toBe('error-body');
      expect(now.status).toBe(before.status);
      expect(now.contentType).toBe('application/json; charset=utf-8');
      const body = JSON.parse(now.body) as Record<string, unknown>;
      expect(Object.keys(body)).toEqual([
        'statusCode',
        'code',
        'error',
        'message',
      ]);
      expect(body).toMatchObject({
        statusCode: now.status,
        code: departure.code,
        error: STATUS_CODES[now.status],
      });
      expect(typeof body.message).toBe('string');
    },
  );
});
