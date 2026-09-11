/**
 * Unit tests for createEntraIdFetch (T039).
 *
 * Tests the per-request token refresh mechanism that solves mid-session
 * token expiry for Entra ID authenticated remote MCP connections.
 *
 * Covers:
 * - Fresh auth headers attached on every request
 * - Static headers (e.g. x-example-token) merged correctly
 * - Caller-provided headers preserved
 * - Automatic 401 retry with force-refreshed token
 * - Non-401 errors passed through without retry
 */

import { afterEach, beforeEach, describe, expect, it, mock, type Mock } from 'bun:test';
import { setupEntraIdMocks } from '../test-utils/entra-id-mocks';
import '../test-utils/mocks';

const { mockGetToken, mockGetEntraIdTokenManager, mockTokenManager } = setupEntraIdMocks();

// Must import after mocks are set up
import { createEntraIdFetch } from './remote-mcp-client';

// Mock global fetch
const originalFetch = globalThis.fetch;
let mockFetch: Mock<(...args: Parameters<typeof fetch>) => Promise<Response>>;

// Save/restore real env vars that would leak into header assertions
let savedExampleToken: string | undefined;

describe('createEntraIdFetch (T039)', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue('test-jwt-token');
    mockGetEntraIdTokenManager.mockReset();
    mockGetEntraIdTokenManager.mockResolvedValue(mockTokenManager);

    // Clear any real API key env vars to prevent them leaking into assertions
    savedExampleToken = process.env.EXAMPLE_SERVICE_TOKEN;
    delete process.env.EXAMPLE_SERVICE_TOKEN;

    mockFetch = mock((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(new Response('OK', { status: 200 })),
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Restore env var
    if (savedExampleToken !== undefined) {
      process.env.EXAMPLE_SERVICE_TOKEN = savedExampleToken;
    }
    mock.restore();
  });

  it('should attach fresh auth headers on every request', async () => {
    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});

    await entraFetch('https://example.com/mcp', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['x-gateway-auth']).toBe('Bearer test-jwt-token');
  });

  it('should merge static headers with auth headers', async () => {
    const staticHeaders = { 'x-example-token': 'my-api-key' };
    const entraFetch = createEntraIdFetch('https://example.com/mcp', staticHeaders);

    await entraFetch('https://example.com/mcp', { method: 'POST' });

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['x-gateway-auth']).toBe('Bearer test-jwt-token');
    expect(headers['x-example-token']).toBe('my-api-key');
  });

  it('should preserve caller-provided headers', async () => {
    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});

    await entraFetch('https://example.com/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-gateway-auth']).toBe('Bearer test-jwt-token');
  });

  it('should retry with force-refreshed token on 401', async () => {
    // First call returns 401, second call returns 200
    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    // After force refresh, return a new token
    mockGetToken
      .mockResolvedValueOnce('test-jwt-token')
      .mockResolvedValueOnce('refreshed-jwt-token');

    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});
    const response = await entraFetch('https://example.com/mcp', { method: 'POST' });

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify second call has refreshed token
    const retryHeaders = mockFetch.mock.calls[1][1]?.headers as Record<string, string>;
    expect(retryHeaders['x-gateway-auth']).toBe('Bearer refreshed-jwt-token');
  });

  it('should not retry on non-401 errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Server Error', { status: 500 }));

    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});
    const response = await entraFetch('https://example.com/mcp', { method: 'POST' });

    expect(response.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should call getToken for each request (not cached)', async () => {
    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});

    await entraFetch('https://example.com/mcp', { method: 'POST' });
    await entraFetch('https://example.com/mcp', { method: 'POST' });

    // getToken should be called once per request (attachAuthHeaders calls it each time)
    expect(mockGetToken).toHaveBeenCalledTimes(2);
  });

  it('should handle Headers object from caller', async () => {
    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});
    const callerHeaders = new Headers();
    callerHeaders.set('X-Custom', 'value');

    await entraFetch('https://example.com/mcp', {
      method: 'POST',
      headers: callerHeaders,
    });

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['X-Custom'] || headers['x-custom']).toBe('value');
    expect(headers['x-gateway-auth']).toBe('Bearer test-jwt-token');
  });

  it('should strip SDK authorization header when static Authorization exists', async () => {
    const staticHeaders = { Authorization: 'Token my-vendor-key' };
    const entraFetch = createEntraIdFetch('https://example.com/mcp', staticHeaders);

    await entraFetch('https://example.com/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer sdk-injected-token' },
    });

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Token my-vendor-key');
    expect(headers['authorization']).toBeUndefined();
  });

  it('should preserve SDK authorization header when no static Authorization exists', async () => {
    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});

    await entraFetch('https://example.com/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer sdk-token' },
    });

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer sdk-token');
  });

  it('should use stripped headers on 401 retry', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    mockGetToken
      .mockResolvedValueOnce('test-jwt-token')
      .mockResolvedValueOnce('refreshed-jwt-token');

    const staticHeaders = { Authorization: 'Token my-vendor-key' };
    const entraFetch = createEntraIdFetch('https://example.com/mcp', staticHeaders);

    await entraFetch('https://example.com/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer sdk-injected-token' },
    });

    // Both initial and retry calls should have the static header, not the SDK one
    for (const call of mockFetch.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Token my-vendor-key');
      expect(headers['authorization']).toBeUndefined();
    }
  });

  it('should not mutate the original init.headers object', async () => {
    const staticHeaders = { Authorization: 'Token my-vendor-key' };
    const entraFetch = createEntraIdFetch('https://example.com/mcp', staticHeaders);

    const sdkHeaders = { authorization: 'Bearer sdk-token', 'x-custom': 'value' };
    await entraFetch('https://example.com/mcp', {
      method: 'POST',
      headers: sdkHeaders,
    });

    // Original object should still have the authorization key
    expect(sdkHeaders['authorization']).toBe('Bearer sdk-token');
  });

  it('should pass serviceId through to attachAuthHeaders on initial request', async () => {
    process.env.EXAMPLE_SERVICE_TOKEN = 'example-scoped-key';

    const entraFetch = createEntraIdFetch('https://example.com/mcp', {}, 'example-service');
    await entraFetch('https://example.com/mcp', { method: 'POST' });

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-gateway-auth']).toBe('Bearer test-jwt-token');
    expect(headers['x-example-token']).toBe('example-scoped-key');
  });

  it('should exclude non-matching service headers when serviceId is provided', async () => {
    process.env.EXAMPLE_SERVICE_TOKEN = 'example-scoped-key';

    // serviceId='unregistered-service' has no entry in SERVICE_AUTH_MAP
    const entraFetch = createEntraIdFetch('https://example.com/mcp', {}, 'unregistered-service');
    await entraFetch('https://example.com/mcp', { method: 'POST' });

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-gateway-auth']).toBe('Bearer test-jwt-token');
    expect(headers['x-example-token']).toBeUndefined();
  });

  it('should pass serviceId through to attachAuthHeaders on 401 retry', async () => {
    process.env.EXAMPLE_SERVICE_TOKEN = 'example-scoped-key';

    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    mockGetToken
      .mockResolvedValueOnce('test-jwt-token')
      .mockResolvedValueOnce('refreshed-jwt-token');

    const entraFetch = createEntraIdFetch('https://example.com/mcp', {}, 'example-service');
    const response = await entraFetch('https://example.com/mcp', { method: 'POST' });

    expect(response.status).toBe(200);
    // Verify retry also has the scoped service header
    const retryHeaders = mockFetch.mock.calls[1][1]?.headers as Record<string, string>;
    expect(retryHeaders['x-example-token']).toBe('example-scoped-key');
  });

  it('should attach only the JWT (no service headers) when serviceId is omitted', async () => {
    // Behavior changed in fix #1148: attachAuthHeaders no longer iterates
    // every SERVICE_AUTH_MAP entry when serviceId is omitted. This prevents
    // cross-service header leak (e.g. one service's Authorization being
    // attached to another service's request). Callers that need a service
    // header must specify which service.
    process.env.EXAMPLE_SERVICE_TOKEN = 'example-key-all';

    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});
    await entraFetch('https://example.com/mcp', { method: 'POST' });

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['x-gateway-auth']).toBe('Bearer test-jwt-token');
    expect(headers['x-example-token']).toBeUndefined();
  });

  it('should pass through request body and method', async () => {
    const entraFetch = createEntraIdFetch('https://example.com/mcp', {});
    const body = JSON.stringify({ tool: 'test' });

    await entraFetch('https://example.com/mcp', {
      method: 'POST',
      body,
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.method).toBe('POST');
    expect(callArgs[1]?.body).toBe(body);
  });
});
