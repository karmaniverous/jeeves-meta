import { describe, expect, it } from 'vitest';

import { metaConfigSchema, serviceConfigSchema } from './config.js';

const validConfig = {
  watcherUrl: 'http://localhost:3456',
  defaultArchitect: 'You are the architect...',
  defaultCritic: 'You are the critic...',
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
      architectTimeout: 120,
      builderTimeout: 600,
      criticTimeout: 300,
    });
  });

  it('accepts config with all fields explicit', () => {
    const result = metaConfigSchema.safeParse({
      ...validConfig,
      architectEvery: 5,
      depthWeight: 0.5,
      maxArchive: 50,
      maxLines: 1000,
      architectTimeout: 60,
      builderTimeout: 300,
      criticTimeout: 120,
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

  it('accepts missing defaultArchitect and defaultCritic (optional, built-in defaults)', () => {
    const partial = {
      watcherUrl: validConfig.watcherUrl,
    };
    const result = metaConfigSchema.safeParse(partial);
    expect(result.success).toBe(true);
    expect(result.data?.defaultArchitect).toBeUndefined();
    expect(result.data?.defaultCritic).toBeUndefined();
  });

  it('rejects architectTimeout below minimum (30)', () => {
    const result = metaConfigSchema.safeParse({
      ...validConfig,
      architectTimeout: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects builderTimeout below minimum (60)', () => {
    const result = metaConfigSchema.safeParse({
      ...validConfig,
      builderTimeout: 30,
    });
    expect(result.success).toBe(false);
  });
  it('applies default metaProperty and metaArchiveProperty', () => {
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

describe('serviceConfigSchema autoSeed', () => {
  const validServiceConfig = {
    ...validConfig,
    port: 1938,
    host: '127.0.0.1',
    schedule: '*/30 * * * *',
  };

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
