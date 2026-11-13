/**
 * @module test/wire/wireRecord
 * Records every wire scenario's reply to the JSON file named by
 * `WIRE_RECORD`. Not part of the test suite (the `.record.ts` suffix is
 * outside vitest's include): run by `npm run wire:record` in this tree, or
 * by `scripts/capture-wire.ts` in a worktree at an older tag. Writes one
 * file.
 */

import { writeFileSync } from 'node:fs';

import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { scenariosFor } from './scenarios.js';
import { startWireApp, type WireApp } from './wireApp.js';
import { runScenario } from './wireRun.js';
import type { WireRecord } from './wireTypes.js';

vi.mock('../../configHotReload.js', () => ({
  applyHotReloadedConfig: vi.fn(),
  RESTART_REQUIRED_FIELDS: ['port', 'gatewayApiKey'],
}));

let wire: WireApp;

beforeAll(async () => {
  wire = await startWireApp();
});

afterAll(async () => {
  await wire.close();
});

it('records every scenario', async () => {
  const out = process.env.WIRE_RECORD;
  expect(out, 'set WIRE_RECORD to the output path').toBeTruthy();
  const records: Record<string, WireRecord> = {};
  for (const scenario of scenariosFor(wire)) {
    records[scenario.name] = await runScenario(wire, scenario);
  }
  writeFileSync(out as string, JSON.stringify(records, null, 2) + '\n');
}, 120_000);
