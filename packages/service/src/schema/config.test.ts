import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEMPLATE_STRINGS,
  metaConfigSchema,
  serviceConfigSchema,
} from './config.js';

const validConfig = {
  watcherUrl: 'http://localhost:3456',
  metaProperty: { _meta: 'current' },
  metaArchiveProperty: { _meta: 'archive' },
};

describe('metaConfigSchema', () => {
  it('accepts valid config with defaults applied', () => {
    const result = metaConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      architectEvery: 10,
      depthWeight: 0.5,
      skipUnchanged: true,
      maxArchive: 20,
      maxLines: 500,
    });
  });

  it('accepts config with all fields explicit', () => {
    const result = metaConfigSchema.safeParse({
      ...validConfig,
      architectEvery: 5,
      depthWeight: 0.5,
      maxArchive: 50,
      maxLines: 1000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid watcherUrl', () => {
    const result = metaConfigSchema.safeParse({
      ...validConfig,
      watcherUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('requires metaProperty — rejects config missing it', () => {
    const result = metaConfigSchema.safeParse({
      watcherUrl: validConfig.watcherUrl,
      metaArchiveProperty: { _meta: 'archive' },
    });
    expect(result.success).toBe(false);
  });

  it('requires metaArchiveProperty — rejects config missing it', () => {
    const result = metaConfigSchema.safeParse({
      watcherUrl: validConfig.watcherUrl,
      metaProperty: { _meta: 'current' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts explicit metaProperty and metaArchiveProperty', () => {
    const result = metaConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    expect(result.data?.metaProperty).toEqual({ _meta: 'current' });
    expect(result.data?.metaArchiveProperty).toEqual({ _meta: 'archive' });
  });

  it('accepts custom metaProperty with domains array', () => {
    const result = metaConfigSchema.safeParse({
      ...validConfig,
      metaProperty: { domains: ['meta'] },
      metaArchiveProperty: { domains: ['meta-archive'] },
    });
    expect(result.success).toBe(true);
    expect(result.data?.metaProperty).toEqual({ domains: ['meta'] });
  });

  it('accepts arbitrary metaProperty shape', () => {
    const result = metaConfigSchema.safeParse({
      ...validConfig,
      metaProperty: { foo: { bar: ['baz'] } },
    });
    expect(result.success).toBe(true);
    expect(result.data?.metaProperty).toEqual({ foo: { bar: ['baz'] } });
  });
});

describe('serviceConfigSchema new fields', () => {
  const validServiceConfig = {
    ...validConfig,
    port: 1938,
    schedule: '*/30 * * * *',
  };

  it('defaults serverUrl to http://127.0.0.1:1934', () => {
    const result = serviceConfigSchema.safeParse(validServiceConfig);
    expect(result.success).toBe(true);
    expect(result.data?.serverUrl).toBe('http://127.0.0.1:1934');
  });

  it('defaults templates to DEFAULT_TEMPLATE_STRINGS', () => {
    const result = serviceConfigSchema.safeParse(validServiceConfig);
    expect(result.success).toBe(true);
    expect(result.data?.templates).toEqual(DEFAULT_TEMPLATE_STRINGS);
  });

  it('accepts custom template overrides', () => {
    const result = serviceConfigSchema.safeParse({
      ...validServiceConfig,
      templates: { phaseStart: 'CUSTOM {{phase}}' },
    });
    expect(result.success).toBe(true);
    expect(result.data?.templates.phaseStart).toBe('CUSTOM {{phase}}');
    // Other templates should still get defaults
    expect(result.data?.templates.phaseEnd).toBe(
      DEFAULT_TEMPLATE_STRINGS.phaseEnd,
    );
    expect(result.data?.templates.phaseError).toBe(
      DEFAULT_TEMPLATE_STRINGS.phaseError,
    );
  });

  it('accepts custom serverUrl', () => {
    const result = serviceConfigSchema.safeParse({
      ...validServiceConfig,
      serverUrl: 'http://custom:9999',
    });
    expect(result.success).toBe(true);
    expect(result.data?.serverUrl).toBe('http://custom:9999');
  });

  it('defaults autoSeed to empty array', () => {
    const result = serviceConfigSchema.safeParse(validServiceConfig);
    expect(result.success).toBe(true);
    expect(result.data?.autoSeed).toEqual([]);
  });

  it('accepts autoSeed with rules', () => {
    const result = serviceConfigSchema.safeParse({
      ...validServiceConfig,
      autoSeed: [
        { match: 'j:/domains/**' },
        {
          match: 'j:/projects/**',
          steer: 'Focus on code',
          crossRefs: ['j:/ref1'],
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.autoSeed).toHaveLength(2);
  });
});
