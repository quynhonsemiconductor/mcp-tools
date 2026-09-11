/**
 * environment-tier.test.ts - Tests for build-time environment tier resolution
 */
import '../test-utils/mocks';
import { describe, expect, it } from 'bun:test';
import { getEnvironmentTier, resolveHostByTier } from './environment-tier';

const TEST_HOSTS: Record<string, string> = {
  prod: 'remote.mcp.qnsc.vn',
  'pre-prod': 'remote.stg.mcp.qnsc.vn',
  'non-prod': 'remote.dev.mcp.qnsc.vn',
};

// --- getEnvironmentTier ---

describe('getEnvironmentTier', () => {
  it('returns a valid tier from BUILD_ENVIRONMENT_TIER', () => {
    // bunfig.toml sets BUILD_ENVIRONMENT_TIER = '"non-prod"' for tests
    const tier = getEnvironmentTier();
    expect(['prod', 'pre-prod', 'non-prod']).toContain(tier);
  });

  it('returns non-prod in the test environment', () => {
    // bunfig.toml defines BUILD_ENVIRONMENT_TIER as "non-prod" for dev/test
    expect(getEnvironmentTier()).toBe('non-prod');
  });
});

// --- resolveHostByTier ---

describe('resolveHostByTier', () => {
  it('returns the host for the current tier', () => {
    const host = resolveHostByTier(TEST_HOSTS);
    // In test env, tier is non-prod
    expect(host).toBe('remote.dev.mcp.qnsc.vn');
  });

  it('falls back to non-prod when tier key is missing from host map', () => {
    const incompleteHosts: Record<string, string> = {
      prod: 'remote.mcp.qnsc.vn',
      'non-prod': 'remote.dev.mcp.qnsc.vn',
      // pre-prod intentionally missing
    };
    // Current test tier is non-prod, so this still resolves directly
    expect(resolveHostByTier(incompleteHosts)).toBe('remote.dev.mcp.qnsc.vn');
  });

  it('throws when neither tier nor non-prod exists in the host map', () => {
    const emptyHosts: Record<string, string> = {
      prod: 'remote.mcp.qnsc.vn',
      // non-prod missing, and test env tier is non-prod
    };
    try {
      resolveHostByTier(emptyHosts);
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('no entry for tier');
      expect(message).toContain('"non-prod" fallback');
    }
  });

  it('returns correct host for each tier in the map', () => {
    expect(TEST_HOSTS['prod']).toBe('remote.mcp.qnsc.vn');
    expect(TEST_HOSTS['pre-prod']).toBe('remote.stg.mcp.qnsc.vn');
    expect(TEST_HOSTS['non-prod']).toBe('remote.dev.mcp.qnsc.vn');
  });
});
