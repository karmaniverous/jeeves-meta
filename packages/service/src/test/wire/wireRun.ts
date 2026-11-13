/**
 * @module test/wire/wireRun
 * Runs a wire scenario against a {@link WireApp} from a reset state and
 * records what a client sees: status, content type and the body text,
 * with volatile values (timestamps, uptime, durations, temp-dir paths)
 * normalised. No assertions.
 */

import type { LightMyRequestResponse } from 'fastify';

import type { WireApp } from './wireApp.js';
import type { WireRecord, WireScenario } from './wireTypes.js';

/**
 * Replace values that change between runs: `/status` uptime and version,
 * staleness counters, random ids, every ISO-8601 timestamp (`_generatedAt`, `checkedAt`, `startedAt`,
 * `enqueuedAt`, `nextAt`, lock timestamps), durations, and the fixture
 * temp directory (both raw and JSON-escaped forms).
 *
 * @param text - Body text.
 * @param wire - The wire app.
 * @returns The normalised text.
 */
export function normaliseBody(text: string, wire: WireApp): string {
  const slashed = wire.dir.replace(/\\/g, '/');
  const forms = [wire.dir, JSON.stringify(wire.dir).slice(1, -1), slashed];
  let out = text;
  for (const form of forms) out = out.split(form).join('{dir}');

  return (
    out
      // Paths joined with the OS separator: one form on every OS.
      .replace(
        /\{dir\}((?:\\\\[^"\\]+)+)/g,
        (_m, rest: string) => '{dir}' + rest.replace(/\\\\/g, '/'),
      )
      .replace(
        /"(seconds|stalenessSeconds|effectiveStaleness)":\d+(\.\d+)?/g,
        '"$1":0',
      )
      // Random v4 ids (fixture ids are fixed and fail the variant nibble).
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g,
        '{uuid}',
      )
      .replace(/"uptime":\s*-?\d+(\.\d+)?/g, '"uptime":0')
      .replace(/("name":"jeeves-meta","version":)"[^"]*"/g, '$1"{version}"')
      .replace(
        /"(checkedAt|startedAt|enqueuedAt|nextAt|_lockStartedAt|lastCycleAt)":"[^"]*"/g,
        '"$1":"{time}"',
      )
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '{timestamp}')
  );
}

/**
 * Run one scenario from a reset state and return the raw reply.
 *
 * @param wire - The wire app.
 * @param scenario - The scenario.
 * @returns The Fastify inject response.
 */
export async function injectScenario(
  wire: WireApp,
  scenario: WireScenario,
): Promise<LightMyRequestResponse> {
  wire.reset();
  Object.assign(wire.state, scenario.state);
  wire.deps.ready = wire.state.ready;
  scenario.setup?.(wire);
  return wire.app.inject({
    method: scenario.method,
    url: scenario.url,
    ...(scenario.payload === undefined
      ? {}
      : { payload: scenario.payload as object }),
  });
}

/**
 * Run one scenario and record the reply.
 *
 * @param wire - The wire app.
 * @param scenario - The scenario.
 * @returns The record.
 */
export async function runScenario(
  wire: WireApp,
  scenario: WireScenario,
): Promise<WireRecord> {
  const res = await injectScenario(wire, scenario);
  const contentType = res.headers['content-type'];
  return {
    status: res.statusCode,
    ...(contentType === undefined ? {} : { contentType }),
    body: normaliseBody(res.body, wire),
  };
}
