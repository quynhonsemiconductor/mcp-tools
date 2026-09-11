/**
 * Tests for OIDC Discovery
 *
 * Verifies the Entra ID OIDC well-known endpoint discovery and caching.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { discoverOidcEndpoints, resetOidcCacheForTesting } from './oidc-discovery';

const testTenantId = 'test-tenant-id-uuid';

const validOidcResponse = {
  authorization_endpoint:
    'https://login.microsoftonline.com/test-tenant-id-uuid/oauth2/v2.0/authorize',
  token_endpoint: 'https://login.microsoftonline.com/test-tenant-id-uuid/oauth2/v2.0/token',
  issuer: 'https://login.microsoftonline.com/test-tenant-id-uuid/v2.0',
  jwks_uri: 'https://login.microsoftonline.com/test-tenant-id-uuid/discovery/v2.0/keys',
};

describe('discoverOidcEndpoints', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    resetOidcCacheForTesting();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    resetOidcCacheForTesting();
    mock.restore();
  });

  it('should fetch OIDC discovery document from correct URL', async () => {
    let capturedUrl = '';

    global.fetch = mock(async (input: any) => {
      capturedUrl = typeof input === 'string' ? input : input.url;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(validOidcResponse),
      } as Response;
    }) as any;

    await discoverOidcEndpoints(testTenantId);

    expect(capturedUrl).toBe(
      `https://login.microsoftonline.com/${testTenantId}/v2.0/.well-known/openid-configuration`,
    );
  });

  it('should return authorization_endpoint, token_endpoint, issuer, and jwks_uri', async () => {
    global.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validOidcResponse),
    })) as any;

    const result = await discoverOidcEndpoints(testTenantId);

    expect(result.authorization_endpoint).toBe(validOidcResponse.authorization_endpoint);
    expect(result.token_endpoint).toBe(validOidcResponse.token_endpoint);
    expect(result.issuer).toBe(validOidcResponse.issuer);
    expect(result.jwks_uri).toBe(validOidcResponse.jwks_uri);
  });

  it('should cache the result and not fetch again', async () => {
    let fetchCount = 0;

    global.fetch = mock(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(validOidcResponse),
      } as Response;
    }) as any;

    const result1 = await discoverOidcEndpoints(testTenantId);
    const result2 = await discoverOidcEndpoints(testTenantId);

    expect(fetchCount).toBe(1);
    expect(result1).toEqual(result2);
  });

  it('should refetch after cache is reset', async () => {
    let fetchCount = 0;

    global.fetch = mock(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve(validOidcResponse),
      } as Response;
    }) as any;

    await discoverOidcEndpoints(testTenantId);
    resetOidcCacheForTesting();
    await discoverOidcEndpoints(testTenantId);

    expect(fetchCount).toBe(2);
  });

  it('should throw on network error', async () => {
    global.fetch = mock(async () => {
      throw new Error('DNS resolution failed');
    }) as any;

    try {
      await discoverOidcEndpoints(testTenantId);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain('Cannot reach authentication service');
    }
  });

  it('should throw on non-OK HTTP response', async () => {
    global.fetch = mock(async () => ({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    })) as any;

    try {
      await discoverOidcEndpoints(testTenantId);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain('OIDC discovery failed with status 404');
    }
  });

  it('should throw on invalid JSON response', async () => {
    global.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Invalid JSON')),
    })) as any;

    try {
      await discoverOidcEndpoints(testTenantId);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain('Invalid OIDC discovery response');
    }
  });

  it('should throw when response is missing authorization_endpoint', async () => {
    global.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          token_endpoint: 'https://example.com/token',
          issuer: 'https://example.com',
          jwks_uri: 'https://example.com/keys',
        }),
    })) as any;

    try {
      await discoverOidcEndpoints(testTenantId);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain('incomplete endpoints');
    }
  });

  it('should throw when response is missing token_endpoint', async () => {
    global.fetch = mock(async () => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          authorization_endpoint: 'https://example.com/authorize',
          issuer: 'https://example.com',
          jwks_uri: 'https://example.com/keys',
        }),
    })) as any;

    try {
      await discoverOidcEndpoints(testTenantId);
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain('incomplete endpoints');
    }
  });

  // T033: OIDC Discovery Resilience tests

  describe('resilience (T033)', () => {
    it('should provide a clear, user-friendly error message on network failure — no stack traces', async () => {
      global.fetch = mock(async () => {
        throw new Error('getaddrinfo ENOTFOUND login.microsoftonline.com');
      }) as any;

      try {
        await discoverOidcEndpoints(testTenantId);
        expect(true).toBe(false);
      } catch (error: any) {
        // Error should be user-friendly
        expect(error.message).toContain('Cannot reach authentication service');
        expect(error.message).toContain('network');
        // Should NOT contain raw DNS error or stack traces
        expect(error.message).not.toContain('getaddrinfo');
        expect(error.message).not.toContain('ENOTFOUND');
        expect(error.message).not.toContain('at ');
      }
    });

    it('should provide actionable error message on HTTP error — includes status code', async () => {
      global.fetch = mock(async () => ({
        ok: false,
        status: 503,
        json: () => Promise.resolve({}),
      })) as any;

      try {
        await discoverOidcEndpoints(testTenantId);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('503');
        expect(error.message).toContain('contact your administrator');
      }
    });

    it('should reuse cached discovery across multiple callers in the same process', async () => {
      global.fetch = mock(async () => {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(validOidcResponse),
        } as Response;
      }) as any;

      // Simulate multiple concurrent callers
      const [r1, r2, r3] = await Promise.all([
        discoverOidcEndpoints(testTenantId),
        discoverOidcEndpoints(testTenantId),
        discoverOidcEndpoints(testTenantId),
      ]);

      // First call fetches, subsequent calls use cache
      // but all results should be identical
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
      expect(r1.authorization_endpoint).toBe(validOidcResponse.authorization_endpoint);
    });

    it('should not cache a failed discovery attempt — retry on next call', async () => {
      let callCount = 0;

      global.fetch = mock(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary network failure');
        }
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(validOidcResponse),
        } as Response;
      }) as any;

      // First call fails
      try {
        await discoverOidcEndpoints(testTenantId);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Cannot reach authentication service');
      }

      // Second call should retry and succeed (not cached failure)
      const result = await discoverOidcEndpoints(testTenantId);
      expect(result.authorization_endpoint).toBe(validOidcResponse.authorization_endpoint);
      expect(callCount).toBe(2);
    });

    it('should provide clear error when discovery response is malformed JSON', async () => {
      global.fetch = mock(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
      })) as any;

      try {
        await discoverOidcEndpoints(testTenantId);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toContain('Invalid OIDC discovery response');
        // Should NOT expose raw JSON parse error
        expect(error.message).not.toContain('Unexpected token');
      }
    });
  });
});
