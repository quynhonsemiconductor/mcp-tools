/**
 * Integration tests for dual-layer authentication (T037).
 *
 * Tests the end-to-end dual-layer auth flow by wiring the platform-auth
 * middleware into a mock request pipeline and verifying that outbound
 * requests carry the correct headers.
 *
 * Covers:
 * - US3-AS1: Valid token + EXAMPLE_SERVICE_TOKEN → both x-gateway-auth and x-example-token headers
 * - US3-AS2: Valid token, no EXAMPLE_SERVICE_TOKEN → only x-gateway-auth header
 * - US3-AS3: No token → SSO login triggered before request
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { setupEntraIdMocks } from '../../../test-utils/entra-id-mocks';
import '../../../test-utils/mocks';

const { mockGetToken, mockGetEntraIdTokenManager, mockTokenManager } = setupEntraIdMocks({
  tokenValue: 'valid-jwt-token',
  config: {
    clientId: 'integration-test-client-id',
    tenantId: 'integration-test-tenant-id',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
  },
});

import { _resetConfigCache, attachAuthHeaders } from './platform-auth';

/**
 * Simulates a remote MCP platform HTTP endpoint that validates headers.
 * Returns the received headers for assertion.
 */
function createMockPlatformEndpoint() {
  const receivedRequests: Array<{ headers: Record<string, string> }> = [];

  const handler = async (headers: Record<string, string>) => {
    receivedRequests.push({ headers: { ...headers } });
    return {
      jsonrpc: '2.0',
      result: { tools: [] },
      id: 1,
    };
  };

  return { handler, receivedRequests };
}

describe('Dual-Layer Auth Integration (T037)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    _resetConfigCache();

    savedEnv.EXAMPLE_SERVICE_TOKEN = process.env.EXAMPLE_SERVICE_TOKEN;
    delete process.env.EXAMPLE_SERVICE_TOKEN;

    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue('valid-jwt-token');
    mockGetEntraIdTokenManager.mockReset();
    mockGetEntraIdTokenManager.mockResolvedValue(mockTokenManager);
  });

  afterEach(() => {
    if (savedEnv.EXAMPLE_SERVICE_TOKEN !== undefined) {
      process.env.EXAMPLE_SERVICE_TOKEN = savedEnv.EXAMPLE_SERVICE_TOKEN;
    } else {
      delete process.env.EXAMPLE_SERVICE_TOKEN;
    }
    mock.restore();
  });

  describe('US3-AS1: Valid Entra ID token + configured EXAMPLE_SERVICE_TOKEN', () => {
    it('should attach both x-gateway-auth: Bearer and x-example-token headers', async () => {
      process.env.EXAMPLE_SERVICE_TOKEN = '_abc123def456';

      const endpoint = createMockPlatformEndpoint();

      // Wire middleware into request pipeline
      const headers = await attachAuthHeaders('https://platform.example.com/mcp', {
        serviceId: 'example-service',
      });
      expect(headers).not.toBeNull();

      // Send request through mock endpoint with middleware headers
      await endpoint.handler(headers!);

      // Verify outbound request carries both headers
      expect(endpoint.receivedRequests).toHaveLength(1);
      const request = endpoint.receivedRequests[0];
      expect(request.headers['x-gateway-auth']).toBe('Bearer valid-jwt-token');
      expect(request.headers['x-example-token']).toBe('_abc123def456');
    });
  });

  describe('US3-AS2: Valid token but no EXAMPLE_SERVICE_TOKEN', () => {
    it('should attach only x-gateway-auth: Bearer header (no x-example-token)', async () => {
      // EXAMPLE_SERVICE_TOKEN not set
      const endpoint = createMockPlatformEndpoint();

      const headers = await attachAuthHeaders('https://platform.example.com/mcp');
      expect(headers).not.toBeNull();
      await endpoint.handler(headers!);

      const request = endpoint.receivedRequests[0];
      expect(request.headers['x-gateway-auth']).toBe('Bearer valid-jwt-token');
      expect(request.headers['x-example-token']).toBeUndefined();
    });
  });

  describe('US3-AS3: No token — SSO login triggered', () => {
    it('should trigger SSO login and use resulting token', async () => {
      // Simulate: first getToken triggers SSO flow, returns fresh token
      mockGetToken.mockResolvedValue('sso-acquired-token');

      const headers = await attachAuthHeaders('https://platform.example.com/mcp');

      expect(headers).not.toBeNull();
      expect(headers!['x-gateway-auth']).toBe('Bearer sso-acquired-token');

      // Verify token manager was invoked (SSO flow happens inside getToken)
      expect(mockGetToken).toHaveBeenCalled();
    });

    it('should propagate SSO failure to caller', async () => {
      mockGetToken.mockRejectedValue(
        new Error(
          'Entra ID authentication required. No stored token available and interactive OAuth is disabled.',
        ),
      );

      try {
        await attachAuthHeaders('https://platform.example.com/mcp');
        expect.unreachable('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('authentication required');
      }
    });
  });
});
