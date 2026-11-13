/**
 * Decision 200 guard, ahead of the routes moving onto the catalog: every 2xx
 * reply recorded from 0.19.0 (`test/wire/wire-0.19.0.json`) parses under its
 * `META_CATALOG` entry's response schema with nothing dropped, so strict
 * response mode will send the same bytes.
 *
 * @module api/catalogResponses.test
 */

import { readFileSync } from 'node:fs';

import { META_CATALOG } from '@karmaniverous/jeeves-meta-core';
import { describe, expect, it } from 'vitest';

import { WIRE_DEPARTURES } from '../test/wire/departures.js';
import { scenariosFor } from '../test/wire/scenarios.js';
import type { WireApp } from '../test/wire/wireApp.js';
import type { WireRecord } from '../test/wire/wireTypes.js';

const records = JSON.parse(
  readFileSync(
    new URL('../test/wire/wire-0.19.0.json', import.meta.url),
    'utf8',
  ),
) as Record<string, WireRecord>;

/** Scenario method and URL by name (paths only; no app needed). */
const fakeWire = {
  dir: '{dir}',
  ownerPath: (p: string) => `{dir}/${p}`,
} as unknown as WireApp;
const scenarios = new Map(scenariosFor(fakeWire).map((s) => [s.name, s]));

/**
 * The catalog entry serving `method url`.
 *
 * @param method - HTTP method.
 * @param url - Request URL (query ignored).
 * @returns The entry, if any.
 */
function entryFor(method: string, url: string) {
  const path = url.split('?')[0];
  return META_CATALOG.entries.find(
    (e) =>
      e.method === method &&
      new RegExp(`^${e.path.replace(/:\w+/g, '[^/]+')}$`).test(path),
  );
}

const successes = Object.entries(records).filter(
  ([name, r]) =>
    r.status >= 200 && r.status < 300 && !(name in WIRE_DEPARTURES),
);

describe('0.19.0 2xx replies under META_CATALOG response schemas', () => {
  it('covers a 2xx reply of every entry', () => {
    const covered = new Set(
      successes.map(([name]) => {
        const s = scenarios.get(name);
        return s && entryFor(s.method, s.url)?.name;
      }),
    );
    expect([...covered].sort()).toEqual(
      META_CATALOG.entries.map((e) => e.name).sort(),
    );
  });

  it.each(successes)('%s parses with nothing dropped', (name, record) => {
    const scenario = scenarios.get(name);
    expect(scenario).toBeDefined();
    const entry = entryFor(scenario!.method, scenario!.url);
    expect(entry).toBeDefined();
    const body: unknown = JSON.parse(record.body);
    expect(entry!.response.parse(body)).toEqual(body);
  });
});
