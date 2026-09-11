/**
 * Integration test for port retry (T032).
 *
 * Verifies that when the default callback port is occupied, the callback
 * server falls back to the next available port and the redirect_uri in
 * the authorization URL matches the actual bound port.
 *
 * Uses real TCP listeners to occupy ports. The base OAuthHandler pre-checks
 * port availability via TCP connect before binding, so port conflicts are
 * detected even when SO_REUSEPORT is enabled (Bun 1.3.11+ on macOS).
 */

import { afterEach, describe, expect, it, mock } from 'bun:test';
import http from 'node:http';
import { CALLBACK_PORTS } from './config';
import { EntraIdOAuthHandler, resetEntraIdOAuthHandlerForTesting } from './oauth-handler';
import type { EntraIdConfig } from './types';

// Mock logger to avoid test noise
void mock.module('../../logger', () => ({
  logDebug: mock(() => {}),
  logInfo: mock(() => {}),
  logError: mock(() => {}),
  logWarn: mock(() => {}),
}));

// Mock browser open to prevent actual browser launches
void mock.module('open', () => ({
  default: mock(() => Promise.resolve()),
}));

const testAuthorizeUrl = 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize';
const testTokenUrl = 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token';

/**
 * Create an HTTP server occupying a specific port on localhost.
 * The server actively accepts connections so that TCP pre-checks detect it.
 */
function occupyPort(port: number): Promise<{ server: http.Server; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on('error', reject);
    server.listen(port, 'localhost', () => {
      resolve({
        server,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe('Port Retry (T032)', () => {
  let blockingServers: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await resetEntraIdOAuthHandlerForTesting();
    for (const s of blockingServers) {
      await s.close();
    }
    blockingServers = [];
    mock.restore();
  });

  it('should include CALLBACK_PORTS as fallback ports', () => {
    expect(CALLBACK_PORTS.length).toBeGreaterThanOrEqual(2);
    expect(CALLBACK_PORTS).toContain(9876);
  });

  it('should list primary port first, then fallback ports', () => {
    const config: EntraIdConfig = {
      clientId: 'test-client-id',
      tenantId: 'test-tenant-id',
      platformUrl: 'https://example.com',
      callbackPort: 8000,
      loginTimeoutMs: 5_000,
      scopes: ['openid'],
    };

    const handler = new EntraIdOAuthHandler(config, testAuthorizeUrl, testTokenUrl);
    const ports = (handler as any).getPortsToTry() as number[];

    // Primary port should be first
    expect(ports[0]).toBe(config.callbackPort);
    // Fallback ports should follow
    expect(ports.length).toBeGreaterThan(1);
    for (const cbPort of CALLBACK_PORTS) {
      if (cbPort !== config.callbackPort) {
        expect(ports).toContain(cbPort);
      }
    }
  });

  it('should fall back to next port when primary is occupied', async () => {
    const primaryPort = 19876;
    const fallbackPort = 19877;

    const config: EntraIdConfig = {
      clientId: 'test-client-id',
      tenantId: 'test-tenant-id',
      platformUrl: 'https://example.com',
      callbackPort: primaryPort,
      loginTimeoutMs: 5_000,
      scopes: ['openid'],
    };

    class TestHandler extends EntraIdOAuthHandler {
      protected override getPortsToTry(): number[] {
        return [primaryPort, fallbackPort];
      }
    }

    // Occupy the primary port with a real listener
    const blocker = await occupyPort(primaryPort);
    blockingServers.push(blocker);

    const handler = new TestHandler(config, testAuthorizeUrl, testTokenUrl);

    try {
      const result = await handler.getAuthUrlOnly();

      expect(result.success).toBe(true);
      if (result.success) {
        const url = new URL(result.url);
        const redirectUri = url.searchParams.get('redirect_uri');
        expect(redirectUri).toBeTruthy();
        expect(redirectUri).toContain(`:${fallbackPort}/`);
        expect(redirectUri).not.toContain(`:${primaryPort}/`);
      }
    } finally {
      await handler.stopServer();
    }
  });

  it('should use primary port when it is available', async () => {
    const primaryPort = 19878;
    const fallbackPort = 19879;

    const config: EntraIdConfig = {
      clientId: 'test-client-id',
      tenantId: 'test-tenant-id',
      platformUrl: 'https://example.com',
      callbackPort: primaryPort,
      loginTimeoutMs: 5_000,
      scopes: ['openid'],
    };

    class TestHandler extends EntraIdOAuthHandler {
      protected override getPortsToTry(): number[] {
        return [primaryPort, fallbackPort];
      }
    }

    const handler = new TestHandler(config, testAuthorizeUrl, testTokenUrl);

    try {
      const result = await handler.getAuthUrlOnly();

      expect(result.success).toBe(true);
      if (result.success) {
        const url = new URL(result.url);
        const redirectUri = url.searchParams.get('redirect_uri');
        expect(redirectUri).toContain(`:${primaryPort}/`);
      }
    } finally {
      await handler.stopServer();
    }
  });

  it('should fail when all ports are occupied', async () => {
    const port1 = 19880;
    const port2 = 19881;

    const config: EntraIdConfig = {
      clientId: 'test-client-id',
      tenantId: 'test-tenant-id',
      platformUrl: 'https://example.com',
      callbackPort: port1,
      loginTimeoutMs: 5_000,
      scopes: ['openid'],
    };

    class TestHandler extends EntraIdOAuthHandler {
      protected override getPortsToTry(): number[] {
        return [port1, port2];
      }
    }

    // Occupy both ports
    const blocker1 = await occupyPort(port1);
    const blocker2 = await occupyPort(port2);
    blockingServers.push(blocker1, blocker2);

    const handler = new TestHandler(config, testAuthorizeUrl, testTokenUrl);

    try {
      await handler.getAuthUrlOnly();
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain('already in use');
    } finally {
      await handler.stopServer();
    }
  });

  it('should update redirect_uri to match actual bound port', async () => {
    const primaryPort = 19882;
    const fallbackPort = 19883;

    const config: EntraIdConfig = {
      clientId: 'test-client-id',
      tenantId: 'test-tenant-id',
      platformUrl: 'https://example.com',
      callbackPort: primaryPort,
      loginTimeoutMs: 5_000,
      scopes: ['openid'],
    };

    class TestHandler extends EntraIdOAuthHandler {
      protected override getPortsToTry(): number[] {
        return [primaryPort, fallbackPort];
      }
    }

    // Occupy primary port to force fallback
    const blocker = await occupyPort(primaryPort);
    blockingServers.push(blocker);

    const handler = new TestHandler(config, testAuthorizeUrl, testTokenUrl);

    try {
      const result = await handler.getAuthUrlOnly();
      expect(result.success).toBe(true);

      if (result.success) {
        const authUrl = new URL(result.url);
        const redirectUri = authUrl.searchParams.get('redirect_uri')!;

        const redirectUrl = new URL(redirectUri);
        expect(redirectUrl.port).toBe(String(fallbackPort));
        expect(redirectUrl.pathname).toBe('/cms/auth/entra/callback');
      }
    } finally {
      await handler.stopServer();
    }
  });
});
