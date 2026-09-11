/**
 * Unit tests for platform auth middleware (T019).
 *
 * Tests attachAuthHeaders() covering:
 * - Adds x-gateway-auth: Bearer header with access token (US3-AS1)
 * - Adds the service header from EXAMPLE_SERVICE_TOKEN env var (US3-AS2)
 * - Omits the service header when EXAMPLE_SERVICE_TOKEN not set (US3-AS3)
 * - Does NOT modify non-platform requests
 * - Triggers SSO login when no valid token exists
 * - ServiceAuthConfig extensibility (adding a second service)
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { setupEntraIdMocks } from '../../../test-utils/entra-id-mocks';
import '../../../test-utils/mocks';

const { mockGetToken, mockGetEntraIdTokenManager, mockTokenManager } = setupEntraIdMocks();

import { _resetConfigCache, attachAuthHeaders, isRemotePlatformRequest } from './platform-auth';

describe('Platform Auth Middleware (T019)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  // All SERVICE_AUTH_MAP env vars must be cleared between tests, otherwise any
  // developer or CI environment with one of these set will fail strict-equality
  // header assertions like `expect(Object.keys(headers)).toEqual(['x-gateway-auth'])`.
  const SERVICE_AUTH_ENV_VARS = ['EXAMPLE_SERVICE_TOKEN', 'EXAMPLE_BEARER_KEY'] as const;

  beforeEach(() => {
    _resetConfigCache();

    // Save and clear all SERVICE_AUTH_MAP env vars
    for (const key of SERVICE_AUTH_ENV_VARS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    // Reset mocks
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue('test-jwt-token');
    mockGetEntraIdTokenManager.mockReset();
    mockGetEntraIdTokenManager.mockResolvedValue(mockTokenManager);
  });

  afterEach(() => {
    // Restore env vars
    for (const key of SERVICE_AUTH_ENV_VARS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    mock.restore();
  });

  describe('isRemotePlatformRequest', () => {
    it('should return true for platform URL', () => {
      expect(isRemotePlatformRequest('https://platform.example.com/mcp')).toBe(true);
    });

    it('should return true for platform URL with different path', () => {
      expect(isRemotePlatformRequest('https://platform.example.com/api/v1/tools')).toBe(true);
    });

    it('should return false for non-platform URL', () => {
      expect(isRemotePlatformRequest('https://other-service.example.com/api')).toBe(false);
    });

    it('should return false for local tool calls', () => {
      expect(isRemotePlatformRequest('http://localhost:3000/tools')).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      expect(isRemotePlatformRequest('not-a-url')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isRemotePlatformRequest('')).toBe(false);
    });
  });

  describe('attachAuthHeaders', () => {
    it('should add x-gateway-auth: Bearer header with access token (US3-AS1)', async () => {
      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer test-jwt-token');
    });

    it('should add x-example-token header from EXAMPLE_SERVICE_TOKEN env var (US3-AS2)', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = '_abc123def456';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer test-jwt-token');
      expect(headers!['x-example-token']).toBe('_abc123def456');
    });

    it('should omit x-example-token when EXAMPLE_SERVICE_TOKEN not set (US3-AS3)', async () => {
      // EXAMPLE_SERVICE_TOKEN is already unset in beforeEach
      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer test-jwt-token');
      expect(headers!['x-example-token']).toBeUndefined();
    });

    it('should omit x-example-token when EXAMPLE_SERVICE_TOKEN is empty string', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = '';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-example-token']).toBeUndefined();
    });

    it('should omit x-example-token when EXAMPLE_SERVICE_TOKEN is only whitespace', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = '   ';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-example-token']).toBeUndefined();
    });

    it('should return null for non-platform requests', async () => {
      const headers = await attachAuthHeaders('https://other-service.example.com/api', {
        serviceId: 'example-service',
      });

      expect(headers).toBeNull();
      expect(mockGetEntraIdTokenManager).not.toHaveBeenCalled();
    });

    it('should trigger SSO login when no valid token exists', async () => {
      // getToken resolves after triggering SSO flow internally
      mockGetToken.mockResolvedValue('fresh-sso-token');

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer fresh-sso-token');
      expect(mockGetToken).toHaveBeenCalled();
    });

    it('should pass forceRefresh option to token manager', async () => {
      mockGetToken.mockResolvedValue('refreshed-token');

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        forceRefresh: true,
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer refreshed-token');
      expect(mockGetToken).toHaveBeenCalledWith({ forceRefresh: true });
    });
  });

  describe('serviceId scoping', () => {
    it('should only attach matching service header when serviceId is provided', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = 'example-key-123';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        skipUrlCheck: true,
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer test-jwt-token');
      expect(headers!['x-example-token']).toBe('example-key-123');
    });

    it('should attach only the JWT when serviceId is not in SERVICE_AUTH_MAP', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = 'example-key-123';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        skipUrlCheck: true,
        serviceId: 'pagerduty', // not in SERVICE_AUTH_MAP
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer test-jwt-token');
      expect(headers!['x-example-token']).toBeUndefined();
      const headerKeys = Object.keys(headers!);
      expect(headerKeys).toEqual(['x-gateway-auth']);
    });

    it('does not attach the bearer service Authorization header when serviceId is example-service (no cross-service leak)', async () => {
      // Regression: previously, the iteration-over-all-entries path would have
      // attached the bearer service's Authorization header to another service's
      // request whenever its env var was set. Now the lookup is keyed on serviceId only.
      process.env.EXAMPLE_SERVICE_TOKEN = 'example-key-123';
      process.env.EXAMPLE_BEARER_KEY = 'sk-bearer-secret';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        skipUrlCheck: true,
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-example-token']).toBe('example-key-123');
      expect(headers!['Authorization']).toBeUndefined();
    });
  });

  describe('ServiceAuthConfig extensibility (FR-017)', () => {
    it('attaches only the requested service header (one-at-a-time)', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = 'example-token-456';
      process.env.EXAMPLE_BEARER_KEY = 'sk-bearer-secret';

      // Request example-service — the bearer service header must not be attached
      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer test-jwt-token');
      expect(headers!['x-example-token']).toBe('example-token-456');
      expect(headers!['Authorization']).toBeUndefined();
    });

    it('should only include the JWT header when the requested service env var is not set', async () => {
      // No env vars set — only x-gateway-auth header
      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      const headerKeys = Object.keys(headers!);
      expect(headerKeys).toEqual(['x-gateway-auth']);
    });
  });

  describe('valueTemplate substitution', () => {
    it('formats the header value using SERVICE_AUTH_MAP valueTemplate', async () => {
      process.env.EXAMPLE_BEARER_KEY = 'sk-test-42';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        skipUrlCheck: true,
        serviceId: 'example-bearer-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['Authorization']).toBe('Bearer sk-test-42');
    });

    it('falls back to raw env value when valueTemplate is not set', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = 'example-raw-key';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        skipUrlCheck: true,
        serviceId: 'example-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['x-example-token']).toBe('example-raw-key');
    });

    it('preserves literal $-patterns in the API key (regression: function-form replace)', async () => {
      // String-form replace would interpret $& as the matched substring
      // (the literal ${value}), corrupting the header. Function-form must
      // treat the value as a literal.
      process.env.EXAMPLE_BEARER_KEY = 'sk-$&-with-dollar';

      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        skipUrlCheck: true,
        serviceId: 'example-bearer-service',
      });

      expect(headers).not.toBeNull();
      expect(headers!['Authorization']).toBe('Bearer sk-$&-with-dollar');
    });
  });
});
