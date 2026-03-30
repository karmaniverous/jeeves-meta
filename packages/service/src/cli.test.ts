import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loadServiceConfig,
  migrateConfigPath,
  resolveConfigPath,
} from './configLoader.js';

describe('resolveConfigPath', () => {
  it('returns --config flag value when present', () => {
    expect(
      resolveConfigPath(['status', '--config', '/path/to/config.json']),
    ).toBe('/path/to/config.json');
  });

  it('returns -c short flag value when present', () => {
    expect(resolveConfigPath(['start', '-c', '/path/to/config.json'])).toBe(
      '/path/to/config.json',
    );
  });

  it('returns --config flag even with other args', () => {
    expect(
      resolveConfigPath([
        '--json',
        '--config',
        '/path/to/config.json',
        'status',
      ]),
    ).toBe('/path/to/config.json');
  });

  it('returns JEEVES_META_CONFIG env var when no flag', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    process.env['JEEVES_META_CONFIG'] = '/env/config.json';
    try {
      expect(resolveConfigPath(['status'])).toBe('/env/config.json');
    } finally {
      if (prev === undefined) {
        delete process.env['JEEVES_META_CONFIG'];
      } else {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });

  it('prefers --config flag over env var', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    process.env['JEEVES_META_CONFIG'] = '/env/config.json';
    try {
      expect(
        resolveConfigPath(['--config', '/flag/config.json', 'status']),
      ).toBe('/flag/config.json');
    } finally {
      if (prev === undefined) {
        delete process.env['JEEVES_META_CONFIG'];
      } else {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });

  it('throws when no config source available', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    delete process.env['JEEVES_META_CONFIG'];
    try {
      expect(() => resolveConfigPath(['status'])).toThrow(
        'Config path required',
      );
    } finally {
      if (prev !== undefined) {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });

  it('throws when --config has no value', () => {
    const prev = process.env['JEEVES_META_CONFIG'];
    delete process.env['JEEVES_META_CONFIG'];
    try {
      expect(() => resolveConfigPath(['status', '--config'])).toThrow(
        'Config path required',
      );
    } finally {
      if (prev !== undefined) {
        process.env['JEEVES_META_CONFIG'] = prev;
      }
    }
  });
});

describe('loadServiceConfig', () => {
  it('throws on missing file', () => {
    expect(() => loadServiceConfig('/nonexistent/config.json')).toThrow();
  });
});

describe('migrateConfigPath', () => {
  const testRoot = join(
    tmpdir(),
    `jeeves-meta-migrate-test-${Date.now().toString()}`,
  );

  function cleanup() {
    rmSync(testRoot, { recursive: true, force: true });
  }

  it('copies old config to new location when new does not exist', () => {
    cleanup();
    mkdirSync(testRoot, { recursive: true });

    const oldPath = join(testRoot, 'jeeves-meta.config.json');
    const newPath = join(testRoot, 'jeeves-meta', 'config.json');
    const content = JSON.stringify({ watcherUrl: 'http://127.0.0.1:1936' });
    writeFileSync(oldPath, content, 'utf8');

    const warnings: string[] = [];
    migrateConfigPath(testRoot, (msg) => warnings.push(msg));

    expect(existsSync(newPath)).toBe(true);
    expect(readFileSync(newPath, 'utf8')).toBe(content);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Migrated config');

    cleanup();
  });

  it('does not overwrite existing new config', () => {
    cleanup();
    mkdirSync(join(testRoot, 'jeeves-meta'), { recursive: true });

    const oldPath = join(testRoot, 'jeeves-meta.config.json');
    const newPath = join(testRoot, 'jeeves-meta', 'config.json');
    writeFileSync(oldPath, '{"old":true}', 'utf8');
    writeFileSync(newPath, '{"new":true}', 'utf8');

    const warnings: string[] = [];
    migrateConfigPath(testRoot, (msg) => warnings.push(msg));

    expect(readFileSync(newPath, 'utf8')).toBe('{"new":true}');
    expect(warnings).toHaveLength(0);

    cleanup();
  });

  it('does nothing when old config does not exist', () => {
    cleanup();
    mkdirSync(testRoot, { recursive: true });

    const warnings: string[] = [];
    migrateConfigPath(testRoot, (msg) => warnings.push(msg));

    expect(existsSync(join(testRoot, 'jeeves-meta', 'config.json'))).toBe(
      false,
    );
    expect(warnings).toHaveLength(0);

    cleanup();
  });
});
