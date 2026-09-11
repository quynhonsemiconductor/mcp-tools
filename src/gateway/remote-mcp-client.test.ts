/**
 * remote-mcp-client.test.ts - Tests for RemoteMCPClient
 *
 * Covers connection lifecycle, OAuth challenge flow (issue #911),
 * session expiry reconnection (issue #1081), parameter coercion,
 * disconnect, and connection status tracking.
 */
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { Mock } from 'bun:test';
import { setupStandardMocks } from '../test-utils/mocks';
import type { logError as logErrorType, logWarn as logWarnType } from '../services/logger';

/**
 * Re-fetches the mocked services/logger module on every call rather than
 * binding it once at import time. setupStandardMocks() re-mocks
 * services/logger each time it runs (including the describe-level call
 * below, after this file's own top-level evaluation), and a static ESM
 * import captured beforehand can end up bound to a stale pre-re-mock
 * function reference — see the "prefer spyOn... mock.module() is global"
 * warning in ../test-utils/mocks.ts. Using a dynamic import here (instead of
 * `require`, which trips no-require-imports) always resolves the live
 * binding at call time.
 */
async function getMockedLogger(): Promise<{
  logError: Mock<typeof logErrorType>;
  logWarn: Mock<typeof logWarnType>;
}> {
  const loggerModule = await import('../services/logger');
  return {
    logError: loggerModule.logError as unknown as Mock<typeof logErrorType>,
    logWarn: loggerModule.logWarn as unknown as Mock<typeof logWarnType>,
  };
}

// --- Mock modules that RemoteMCPClient depends on ---

const mockClientConnect = mock(() => Promise.resolve());
const mockClientGetServerVersion = mock(() => ({
  name: 'Test Server',
  version: '1.0.0',
}));
const mockClientListTools = mock(() => Promise.resolve({ tools: [] as unknown[] }));
const mockClientCallTool = mock(() => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }));

// mock.module()'s declared return type is `void | Promise<void>` (it's
// synchronous in practice), so these top-level calls are floating promises
// by that type alone — void them rather than adding a meaningless await.
void mock.module('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class MockClient {
    connect = mockClientConnect;
    getServerVersion = mockClientGetServerVersion;
    listTools = mockClientListTools;
    callTool = mockClientCallTool;
  },
}));

const mockTransportFinishAuth = mock(() => Promise.resolve());
const mockTransportClose = mock(() => {});

const mockTransportConstructorArgs: [URL, StreamableHTTPClientTransportOptions | undefined][] = [];

class MockStreamableHTTPError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(`Streamable HTTP error: ${message}`);
    this.code = code;
  }
}

void mock.module('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class MockTransport {
    finishAuth = mockTransportFinishAuth;
    close = mockTransportClose;
    constructor(...args: [URL, StreamableHTTPClientTransportOptions | undefined]) {
      mockTransportConstructorArgs.push(args);
    }
  },
  StreamableHTTPError: MockStreamableHTTPError,
}));

const mockWaitForCallback = mock(() => Promise.resolve('mock-auth-code'));
void mock.module('../services/oauth/callback-server', () => ({
  OAuthCallbackServer: {
    REDIRECT_URI: 'http://localhost:8090/callback',
    waitForCallback: mockWaitForCallback,
  },
}));

void mock.module('open', () => ({
  default: mock(() => Promise.resolve()),
}));

// Import after mocking
import type { RemoteMCPServerConfig } from './remote-mcp-client';
import { RemoteMCPClient, coerceJsonStringParameters } from './remote-mcp-client';
import { RemoteMcpOauthProvider } from './auth/remote-mcp-oauth-provider';

describe('RemoteMCPClient', () => {
  setupStandardMocks();

  let client: RemoteMCPClient;

  const baseConfig: RemoteMCPServerConfig = {
    id: 'test-server',
    name: 'Test MCP Server',
    url: 'https://test.example.com/mcp',
    enabled: true,
  };

  beforeEach(() => {
    client = new RemoteMCPClient(TEST_AUTH_MAP);
    mockClientConnect.mockReset();
    mockClientGetServerVersion.mockReset();
    mockClientListTools.mockReset();
    mockClientCallTool.mockReset();
    mockTransportFinishAuth.mockReset();
    mockWaitForCallback.mockReset();
    mockTransportConstructorArgs.length = 0; // NEW: clear captured args between tests

    mockClientGetServerVersion.mockReturnValue({
      name: 'Test Server',
      version: '1.0.0',
    });
    mockClientListTools.mockResolvedValue({ tools: [] });
    mockWaitForCallback.mockResolvedValue('mock-auth-code');
    mockTransportFinishAuth.mockResolvedValue(undefined);
  });

  describe('connectToServer', () => {
    it('should skip disabled servers', async () => {
      const disabledConfig = { ...baseConfig, enabled: false };
      await client.connectToServer(disabledConfig);

      expect(mockClientConnect).not.toHaveBeenCalled();
    });

    it('should connect successfully when no auth is required', async () => {
      mockClientConnect.mockResolvedValue(undefined);

      await client.connectToServer(baseConfig);

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should handle UnauthorizedError and complete OAuth flow', async () => {
      // First connect throws UnauthorizedError, second succeeds
      let callCount = 0;
      mockClientConnect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new UnauthorizedError());
        }
        return Promise.resolve();
      });

      await client.connectToServer(baseConfig);

      expect(mockWaitForCallback).toHaveBeenCalledWith('test-server');
      expect(mockTransportFinishAuth).toHaveBeenCalledWith('mock-auth-code');
      // Called twice: initial + retry after OAuth
      expect(mockClientConnect).toHaveBeenCalledTimes(2);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should log error when non-auth error occurs and no redirect was initiated', async () => {
      mockClientConnect.mockRejectedValue(
        new Error('Incompatible auth server: does not support dynamic client registration'),
      );

      await client.connectToServer(baseConfig);

      const { logError: mockLogError } = await getMockedLogger();
      expect(mockLogError).toHaveBeenCalled();
      const errorCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      expect(errorCall[0]).toContain('Failed to connect to remote MCP server test-server');
    });

    it('should log descriptive error message when auth fails without redirect', async () => {
      const dcrError = new Error(
        'Incompatible auth server: does not support dynamic client registration',
      );
      mockClientConnect.mockRejectedValue(dcrError);

      await client.connectToServer(baseConfig);

      const { logError: mockLogError } = await getMockedLogger();
      expect(mockLogError).toHaveBeenCalled();
      const errorCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      // The full message should include the OAuth failure context and guidance
      expect(errorCall[0]).toContain('OAuth authentication failed');
      expect(errorCall[0]).toContain('oAuthClientInformation');
    });

    it('should connect with static headers when provided', async () => {
      mockClientConnect.mockResolvedValue(undefined);

      const configWithHeaders = {
        ...baseConfig,
        headers: { Authorization: 'Bearer test-token' },
      };

      await client.connectToServer(configWithHeaders);

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should connect with pre-configured oAuthClientInformation', async () => {
      mockClientConnect.mockResolvedValue(undefined);

      const configWithOAuth = {
        ...baseConfig,
        oAuthClientInformation: { client_id: 'test-client-id' },
      };

      await client.connectToServer(configWithOAuth);

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    describe('static-bearer authType', () => {
      const savedEnv: Record<string, string | undefined> = {};

      beforeEach(() => {
        savedEnv.PARTNER_API_TOKEN = process.env.PARTNER_API_TOKEN;
      });

      afterEach(() => {
        if (savedEnv.PARTNER_API_TOKEN === undefined) {
          delete process.env.PARTNER_API_TOKEN;
        } else {
          process.env.PARTNER_API_TOKEN = savedEnv.PARTNER_API_TOKEN;
        }
      });

      const partnerConfig: RemoteMCPServerConfig = {
        id: 'partner-api',
        name: 'Partner API MCP Server',
        url: 'https://mcp.partner.example.com',
        enabled: true,
        authType: 'static-bearer',
      };

      it('bails out with disconnected status when env var is unset', async () => {
        delete process.env.PARTNER_API_TOKEN;

        await client.connectToServer(partnerConfig);

        expect(mockClientConnect).not.toHaveBeenCalled();
        const status = client.getConnectionStatus();
        expect(status['partner-api']).toBe('disconnected');

        const { logWarn: mockLogWarn } = await getMockedLogger();
        const warnCalls = mockLogWarn.mock.calls;
        const matchingWarn = warnCalls.find(
          (args) =>
            typeof args[0] === 'string' &&
            args[0].includes('Partner API') &&
            args[0].includes('PARTNER_API_TOKEN'),
        );
        expect(matchingWarn).toBeDefined();
      });

      it('bails out when env var is whitespace-only', async () => {
        process.env.PARTNER_API_TOKEN = '   ';

        await client.connectToServer(partnerConfig);

        expect(mockClientConnect).not.toHaveBeenCalled();
        const status = client.getConnectionStatus();
        expect(status['partner-api']).toBe('disconnected');
      });

      it('connects normally when env var is set', async () => {
        process.env.PARTNER_API_TOKEN = 'sk-test-456';
        mockClientConnect.mockResolvedValue(undefined);

        await client.connectToServer(partnerConfig);

        expect(mockClientConnect).toHaveBeenCalledTimes(1);
        const status = client.getConnectionStatus();
        expect(status['partner-api']).toBe('connected');
      });

      it('does not install an OAuth authProvider on the transport (regression: DCR cascade)', async () => {
        process.env.PARTNER_API_TOKEN = 'sk-test-456';
        mockClientConnect.mockResolvedValue(undefined);

        await client.connectToServer(partnerConfig);

        // Transport constructor args: [url, options]. Assert options.authProvider is undefined
        // for static-bearer so the SDK won't parse 401 responses as OAuth errors and trigger DCR.
        expect(mockTransportConstructorArgs.length).toBeGreaterThan(0);
        const lastTransportArgs =
          mockTransportConstructorArgs[mockTransportConstructorArgs.length - 1];
        const transportOptions = lastTransportArgs[1];
        expect(transportOptions?.authProvider).toBeUndefined();
      });

      it('installs createStaticBearerFetch as the transport fetch override', async () => {
        process.env.PARTNER_API_TOKEN = 'sk-test-456';
        mockClientConnect.mockResolvedValue(undefined);

        await client.connectToServer(partnerConfig);

        // Assert a fetch override is set (the static-bearer wrapper). We can't deep-equal
        // the function, but we can verify one was provided.
        expect(mockTransportConstructorArgs.length).toBeGreaterThan(0);
        const lastTransportArgs =
          mockTransportConstructorArgs[mockTransportConstructorArgs.length - 1];
        const transportOptions = lastTransportArgs[1];
        expect(typeof transportOptions?.fetch).toBe('function');
      });

      it('sets error status when authType is static-bearer but no SERVICE_AUTH_MAP entry exists', async () => {
        // Misconfigured server: declares static-bearer but the id is not in SERVICE_AUTH_MAP.
        // The guard in connectViaHttp throws so a misconfigured server is loud, not silent.
        process.env.PARTNER_API_TOKEN = 'sk-test-456';
        const orphanConfig: RemoteMCPServerConfig = {
          id: 'no-such-service-in-map',
          name: 'Orphan MCP Server',
          url: 'https://orphan.example.com',
          enabled: true,
          authType: 'static-bearer',
        };

        await client.connectToServer(orphanConfig);

        expect(mockClientConnect).not.toHaveBeenCalled();
        const status = client.getConnectionStatus();
        expect(status['no-such-service-in-map']).toBe('error');
      });
    });
  });

  describe('OAuth challenge flow (issue #911)', () => {
    it('should catch non-UnauthorizedError when redirect was not initiated', async () => {
      mockClientConnect.mockRejectedValue(new Error('Token exchange failed'));

      await client.connectToServer(baseConfig);

      // Since redirect was NOT initiated, error should be wrapped
      const { logError: mockLogError } = await getMockedLogger();
      expect(mockLogError).toHaveBeenCalled();
      const lastCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      expect(lastCall[0]).toContain('OAuth authentication failed');
    });

    it('should wrap non-auth errors with clear message mentioning oAuthClientInformation', async () => {
      const originalError = new Error('Server error during DCR');
      mockClientConnect.mockRejectedValue(originalError);

      await client.connectToServer(baseConfig);

      const { logError: mockLogError } = await getMockedLogger();
      const lastCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      // The full message should advise about oAuthClientInformation
      expect(lastCall[0]).toContain('oAuthClientInformation');
    });

    it('should preserve original error as cause in wrapped error', async () => {
      const originalError = new Error('DCR registration endpoint returned 404');
      mockClientConnect.mockRejectedValue(originalError);

      await client.connectToServer(baseConfig);

      const { logError: mockLogError } = await getMockedLogger();
      const lastCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      // The second arg to logError is the cause/error object
      expect(lastCall[1]).toBeDefined();
    });

    it('should retry after clearing credentials when initial connect fails with non-auth error', async () => {
      // First connect fails with stale-credentials error, retry succeeds
      let callCount = 0;
      mockClientConnect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Invalid client_id'));
        }
        return Promise.resolve();
      });

      await client.connectToServer(baseConfig);

      // Should have connected twice: initial fail + successful retry
      expect(mockClientConnect).toHaveBeenCalledTimes(2);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');

      // Should NOT have waited for OAuth callback since retry succeeded
      expect(mockWaitForCallback).not.toHaveBeenCalled();
    });

    it('should handle OAuth flow triggered on retry after clearing credentials', async () => {
      // First connect fails with non-auth error, retry throws UnauthorizedError (OAuth redirect)
      let callCount = 0;
      mockClientConnect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Stale DCR credentials'));
        }
        if (callCount === 2) {
          return Promise.reject(new UnauthorizedError());
        }
        return Promise.resolve();
      });

      await client.connectToServer(baseConfig);

      // 3 calls: initial fail + retry (UnauthorizedError) + post-OAuth connect
      expect(mockClientConnect).toHaveBeenCalledTimes(3);
      expect(mockWaitForCallback).toHaveBeenCalledWith('test-server');
      expect(mockTransportFinishAuth).toHaveBeenCalledWith('mock-auth-code');
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should include both original and retry error messages when both fail', async () => {
      // Both connect attempts fail with different errors
      let callCount = 0;
      mockClientConnect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Original DCR failure'));
        }
        return Promise.reject(new Error('Retry also failed'));
      });

      await client.connectToServer(baseConfig);

      const { logError: mockLogError } = await getMockedLogger();
      const lastCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      // Should contain both error messages for diagnostics
      expect(lastCall[0]).toContain('Retry also failed');
      expect(lastCall[0]).toContain('Original DCR failure');
    });
  });

  // Repro of the #1206/#1212 migration reverted as #1229 for Slack/New Relic
  // auth failures: a stale cached OAuth client from before a gateway migration
  // gets silently reused and rejected by the new gateway, hanging until the
  // callback times out. wasFreshlyRegistered() is spied as a plain method
  // (not the getter it conceptually is) because Bun's spyOn doesn't support
  // accessor properties yet.
  describe('OAuth callback timeout retry (stale cached OAuth client self-heal)', () => {
    it('should invalidate client info and retry once when the callback times out using cached (non-fresh) client info', async () => {
      spyOn(RemoteMcpOauthProvider.prototype, 'wasFreshlyRegistered').mockReturnValue(false);
      const invalidateSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'invalidateCredentials',
      ).mockImplementation(() => {});

      // connect() call 1 (1st connectViaHttp attempt) and call 2 (retried
      // connectViaHttp's top-level connect) both trigger the OAuth redirect
      // branch; call 3 (the "retry connection after completing OAuth flow"
      // step, post-finishAuth) succeeds.
      let connectCallCount = 0;
      mockClientConnect.mockImplementation(() => {
        connectCallCount++;
        if (connectCallCount <= 2) {
          return Promise.reject(new UnauthorizedError());
        }
        return Promise.resolve();
      });

      // First callback wait times out; second (post-retry) succeeds.
      let callbackCallCount = 0;
      mockWaitForCallback.mockImplementation(() => {
        callbackCallCount++;
        if (callbackCallCount === 1) {
          return Promise.reject(new Error('OAuth callback server timed out'));
        }
        return Promise.resolve('mock-auth-code');
      });

      await client.connectToServer(baseConfig);

      // 'all', not just 'client': a client_id stale enough to be rejected
      // on its own domain almost certainly minted tokens that are equally
      // unusable — see maybeRetryWithFreshClient's doc comment.
      expect(invalidateSpy).toHaveBeenCalledWith('all');
      expect(mockWaitForCallback).toHaveBeenCalledTimes(2);
      expect(mockTransportFinishAuth).toHaveBeenCalledWith('mock-auth-code');
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should NOT retry when the callback rejects with an explicit OAuth denial rather than a timeout', async () => {
      // Same cached (non-fresh) client info as the retry-triggering case above,
      // but the callback server's /callback route rejects with the raw OAuth
      // error string (e.g. the user clicked "Deny") instead of the timeout
      // message. That's the user explicitly saying no, not a signal that the
      // cached client_id is stale — retrying would just pop the browser again
      // for the same answer.
      spyOn(RemoteMcpOauthProvider.prototype, 'wasFreshlyRegistered').mockReturnValue(false);
      const invalidateSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'invalidateCredentials',
      ).mockImplementation(() => {});

      mockClientConnect.mockImplementation(() => Promise.reject(new UnauthorizedError()));
      mockWaitForCallback.mockRejectedValue(new Error('access_denied'));

      await client.connectToServer(baseConfig);

      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(mockWaitForCallback).toHaveBeenCalledTimes(1);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });

    it('should NOT retry (and surface the error) when the callback times out using freshly-registered client info', async () => {
      spyOn(RemoteMcpOauthProvider.prototype, 'wasFreshlyRegistered').mockReturnValue(true);
      const invalidateSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'invalidateCredentials',
      ).mockImplementation(() => {});

      mockClientConnect.mockImplementation(() => Promise.reject(new UnauthorizedError()));
      mockWaitForCallback.mockRejectedValue(new Error('OAuth callback server timed out'));

      await client.connectToServer(baseConfig);

      // No retry attempted — this is a genuine timeout (or a fresh registration
      // already having been rejected), not a stale-cache collision.
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(mockWaitForCallback).toHaveBeenCalledTimes(1);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });

    it('should NOT retry for a server with static oAuthClientInformation, even when wasFreshlyRegistered is false', async () => {
      // Static config (e.g. newrelic, slack) never goes through DCR, so
      // wasFreshlyRegistered() can never become true for it. Without this
      // guard the retry would still be bounded to one attempt (by
      // isRetryAfterCallbackTimeout below), but that one retry would be
      // pointless: the constructor re-hydrates _clientInformation straight
      // from config.oAuthClientInformation on the fresh instance, so clearing
      // the keyring has no effect and the same rejection just repeats once
      // before failing anyway — a wasted browser popup for exactly the
      // servers this fix exists to protect.
      const staticConfig: RemoteMCPServerConfig = {
        ...baseConfig,
        oAuthClientInformation: { client_id: 'static-client-id' },
      };
      spyOn(RemoteMcpOauthProvider.prototype, 'wasFreshlyRegistered').mockReturnValue(false);
      const invalidateSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'invalidateCredentials',
      ).mockImplementation(() => {});

      mockClientConnect.mockImplementation(() => Promise.reject(new UnauthorizedError()));
      mockWaitForCallback.mockRejectedValue(new Error('OAuth callback server timed out'));

      await client.connectToServer(staticConfig);

      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(mockWaitForCallback).toHaveBeenCalledTimes(1);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });

    it('should retry at most once even if the retry attempt also times out (bounded regardless of wasFreshlyRegistered)', async () => {
      // Defense in depth: even if wasFreshlyRegistered() were somehow still
      // false on the retried attempt (e.g. it fails before DCR ever runs),
      // isRetryAfterCallbackTimeout must cap this at exactly one retry so a
      // persistently-failing server can't loop forever.
      spyOn(RemoteMcpOauthProvider.prototype, 'wasFreshlyRegistered').mockReturnValue(false);
      const invalidateSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'invalidateCredentials',
      ).mockImplementation(() => {});

      mockClientConnect.mockImplementation(() => Promise.reject(new UnauthorizedError()));
      mockWaitForCallback.mockRejectedValue(new Error('OAuth callback server timed out'));

      await client.connectToServer(baseConfig);

      expect(mockClientConnect).toHaveBeenCalledTimes(2);
      expect(mockWaitForCallback).toHaveBeenCalledTimes(2);
      expect(invalidateSpy).toHaveBeenCalledTimes(1);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });

    it('should apply the same invalidate-and-retry guard in the pre-redirect-failure retry path', async () => {
      // connectViaHttp has two callback-wait sites: the main OAuth-redirect
      // branch (covered above) and this one, nested inside the pre-existing
      // "initial connect failed with a non-auth error -> invalidate all ->
      // retry" branch. Reaching it requires: call 1 fails non-auth (enters
      // that branch), call 2 (the "retry with cleared credentials" connect)
      // throws UnauthorizedError (enters its nested OAuth-callback wait),
      // then the callback wait itself fails — exercising this fix's guard a
      // second, independent time. Call 3 is the fresh connectViaHttp retry
      // (via connectViaHttp(config, true)) succeeding outright.
      spyOn(RemoteMcpOauthProvider.prototype, 'wasFreshlyRegistered').mockReturnValue(false);
      const invalidateSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'invalidateCredentials',
      ).mockImplementation(() => {});

      let connectCallCount = 0;
      mockClientConnect.mockImplementation(() => {
        connectCallCount++;
        if (connectCallCount === 1) {
          return Promise.reject(new Error('Stale DCR credentials'));
        }
        if (connectCallCount === 2) {
          return Promise.reject(new UnauthorizedError());
        }
        return Promise.resolve();
      });
      mockWaitForCallback.mockRejectedValueOnce(new Error('OAuth callback server timed out'));

      await client.connectToServer(baseConfig);

      expect(invalidateSpy).toHaveBeenCalledWith('all');
      expect(mockClientConnect).toHaveBeenCalledTimes(3);
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });
  });

  // RFC 7592 DCR-invalidation reconciliation (see
  // mcp-auth-gateway/docs/technical/DCR_INVALIDATION_RECONCILIATION.md, Part B).
  // reconcileRegistration runs BEFORE the initial connect so an expired/revoked
  // registration is re-registered up front rather than dead-ending the user in
  // a front-channel browser redirect.
  describe('DCR registration reconciliation', () => {
    it('should call reconcileRegistration before the initial client.connect (OAuth path)', async () => {
      const order: string[] = [];
      const reconcileSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'reconcileRegistration',
      ).mockImplementation(async () => {
        order.push('reconcile');
      });
      mockClientConnect.mockImplementation(() => {
        order.push('connect');
        return Promise.resolve();
      });

      await client.connectToServer(baseConfig);

      expect(reconcileSpy).toHaveBeenCalledTimes(1);
      // Reconcile must precede the very first connect attempt.
      expect(order[0]).toBe('reconcile');
      expect(order[1]).toBe('connect');
    });

    it('should NOT reconcile for static-bearer auth (no OAuth provider installed)', async () => {
      process.env.PARTNER_API_TOKEN = 'sk-test-789';
      const reconcileSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'reconcileRegistration',
      ).mockResolvedValue(undefined);
      mockClientConnect.mockResolvedValue(undefined);

      await client.connectToServer({
        id: 'partner-api',
        name: 'Partner API MCP Server',
        url: 'https://mcp.partner.example.com',
        enabled: true,
        authType: 'static-bearer',
      });

      expect(reconcileSpy).not.toHaveBeenCalled();
      delete process.env.PARTNER_API_TOKEN;
    });

    it('should re-register a dead registration before connecting, without a wasted browser redirect', async () => {
      // Model a dead (probe → 401) registration: reconcile clears credentials
      // up front, so the SDK re-registers and runs exactly ONE clean OAuth
      // authorization cycle — no dead-end front-channel redirect, no timeout.
      const order: string[] = [];
      const invalidateSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'invalidateCredentials',
      ).mockImplementation(() => {
        order.push('invalidate');
      });
      const reconcileSpy = spyOn(
        RemoteMcpOauthProvider.prototype,
        'reconcileRegistration',
      ).mockImplementation(async function (this: RemoteMcpOauthProvider) {
        order.push('reconcile');
        // A 401 probe clears everything so the SDK registers fresh. Invoking
        // the spied invalidateCredentials (synchronous in this mock) — its
        // real signature returns `void | Promise<void>`, so void it rather
        // than await a value that's never actually pending here.
        void this.invalidateCredentials('all');
      });

      let connectCallCount = 0;
      mockClientConnect.mockImplementation(() => {
        connectCallCount++;
        order.push(`connect#${connectCallCount}`);
        // First connect (post fresh-registration) triggers the legitimate
        // authorization redirect; the post-callback retry succeeds.
        if (connectCallCount === 1) {
          return Promise.reject(new UnauthorizedError());
        }
        return Promise.resolve();
      });

      await client.connectToServer(baseConfig);

      // Reconcile + its invalidation both happen before the first connect.
      expect(order[0]).toBe('reconcile');
      expect(order[1]).toBe('invalidate');
      expect(order[2]).toBe('connect#1');
      expect(reconcileSpy).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith('all');

      // Exactly one browser-redirect/callback cycle — the fresh, legitimate one.
      expect(mockWaitForCallback).toHaveBeenCalledTimes(1);
      expect(mockTransportFinishAuth).toHaveBeenCalledWith('mock-auth-code');
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });
  });

  describe('error reporting improvements', () => {
    it('should log full error message, not just error.cause', async () => {
      const error = new Error('Connection refused');
      mockClientConnect.mockRejectedValue(error);

      await client.connectToServer(baseConfig);

      const { logError: mockLogError } = await getMockedLogger();
      expect(mockLogError).toHaveBeenCalled();
      const lastCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      // The first arg should contain the full error context
      expect(lastCall[0]).toContain('Connection refused');
    });

    it('should handle non-Error thrown values', async () => {
      mockClientConnect.mockRejectedValue('string error');

      await client.connectToServer(baseConfig);

      const { logError: mockLogError } = await getMockedLogger();
      expect(mockLogError).toHaveBeenCalled();
      const lastCall = mockLogError.mock.calls[mockLogError.mock.calls.length - 1];
      expect(lastCall[0]).toContain('string error');
    });
  });

  describe('coerceJsonStringParameters', () => {
    it('should parse a JSON object string into an object', () => {
      const result = coerceJsonStringParameters({
        query_model: '{"query":"ICO"}',
      });
      expect(result.query_model).toEqual({ query: 'ICO' });
    });

    it('should parse a JSON array string into an array', () => {
      const result = coerceJsonStringParameters({
        ids: '["a","b","c"]',
      });
      expect(result.ids).toEqual(['a', 'b', 'c']);
    });

    it('should leave plain strings untouched', () => {
      const result = coerceJsonStringParameters({
        name: 'hello world',
      });
      expect(result.name).toBe('hello world');
    });

    it('should leave invalid JSON strings that look like JSON untouched', () => {
      const result = coerceJsonStringParameters({
        bad: '{not json}',
      });
      expect(result.bad).toBe('{not json}');
    });

    it('should preserve non-string values (numbers, booleans, objects)', () => {
      const obj = { nested: true };
      const result = coerceJsonStringParameters({
        count: 42,
        flag: true,
        data: obj,
      });
      expect(result.count).toBe(42);
      expect(result.flag).toBe(true);
      expect(result.data).toBe(obj);
    });

    it('should handle null or non-object parameters gracefully', () => {
      expect(coerceJsonStringParameters(null)).toBeNull();
      expect(coerceJsonStringParameters(undefined)).toBeUndefined();
    });

    it('should handle empty object parameters', () => {
      const result = coerceJsonStringParameters({});
      expect(result).toEqual({});
    });

    it('should not coerce short strings like single braces', () => {
      const result = coerceJsonStringParameters({
        a: '{',
        b: '}',
      });
      expect(result.a).toBe('{');
      expect(result.b).toBe('}');
    });

    it('should coerce "{}" into an empty object', () => {
      const result = coerceJsonStringParameters({ empty: '{}' });
      expect(result.empty).toEqual({});
    });

    it('should coerce "[]" into an empty array', () => {
      const result = coerceJsonStringParameters({ empty: '[]' });
      expect(result.empty).toEqual([]);
    });

    it('should NOT coerce a string parameter when schema declares type: "string"', () => {
      const schema = {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'Raw JSON body to send' },
        },
      };
      const result = coerceJsonStringParameters({ body: '{"query":"ICO"}' }, schema);
      // Should remain a string because the schema says it's a string
      expect(result.body).toBe('{"query":"ICO"}');
    });

    it('should coerce when schema declares type: "object"', () => {
      const schema = {
        type: 'object',
        properties: {
          query_model: { type: 'object' },
        },
      };
      const result = coerceJsonStringParameters({ query_model: '{"query":"ICO"}' }, schema);
      expect(result.query_model).toEqual({ query: 'ICO' });
    });

    it('should NOT coerce params whose schema can accept a string (nullable/union/$ref/array-type)', () => {
      const schema = {
        type: 'object',
        properties: {
          nullableStr: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          arrayType: { type: ['string', 'null'] },
          refStr: { $ref: '#/$defs/StrDef' },
          strOrObj: { anyOf: [{ type: 'object' }, { type: 'string' }] },
        },
        $defs: { StrDef: { type: 'string' } },
      };
      const result = coerceJsonStringParameters(
        {
          nullableStr: '{"a":1}',
          arrayType: '{"a":1}',
          refStr: '{"a":1}',
          strOrObj: '{"a":1}',
        },
        schema,
      );
      expect(result.nullableStr).toBe('{"a":1}');
      expect(result.arrayType).toBe('{"a":1}');
      expect(result.refStr).toBe('{"a":1}');
      expect(result.strOrObj).toBe('{"a":1}');
    });

    it('should coerce when schema has no type for the parameter', () => {
      const schema = {
        type: 'object',
        properties: {
          query_model: { description: 'no type declared' },
        },
      };
      const result = coerceJsonStringParameters({ query_model: '{"query":"ICO"}' }, schema);
      expect(result.query_model).toEqual({ query: 'ICO' });
    });

    it('should coerce when no schema is provided (backwards-compatible)', () => {
      const result = coerceJsonStringParameters({
        query_model: '{"query":"ICO"}',
      });
      expect(result.query_model).toEqual({ query: 'ICO' });
    });

    it('should not coerce nested JSON strings inside objects', () => {
      const result = coerceJsonStringParameters({
        outer: { inner: '{"key":"val"}' },
      });
      // Only top-level values are coerced; nested strings are untouched
      expect((result.outer as Record<string, unknown>).inner).toBe('{"key":"val"}');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from all servers', async () => {
      mockClientConnect.mockResolvedValue(undefined);
      await client.connectToServer(baseConfig);

      await client.disconnect();

      expect(mockTransportClose).toHaveBeenCalled();
    });
  });

  describe('getConnectionStatus', () => {
    it('should return empty status when no connections exist', () => {
      const status = client.getConnectionStatus();
      expect(Object.keys(status)).toHaveLength(0);
    });

    it('should track connected status', async () => {
      mockClientConnect.mockResolvedValue(undefined);
      await client.connectToServer(baseConfig);

      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('connected');
    });

    it('should include error-state servers even after connection entry is torn down', async () => {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({
        tools: [
          {
            name: 'getRemoteItem',
            description: 'Get item',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      });
      await client.connectToServer(baseConfig);

      // Trigger a session expiry where reconnection fails — this tears down the
      // connection entry but sets connectionStatus to 'error'
      mockClientCallTool.mockRejectedValue(new MockStreamableHTTPError(404, 'Session not found'));
      mockClientConnect.mockReset();
      mockClientConnect.mockRejectedValue(new Error('Server unreachable'));

      await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      // The connection entry is gone but getConnectionStatus should still report it
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });
  });

  describe('session expiry reconnection', () => {
    // Helper: connect the client so it has a live connection to exercise
    async function connectClient() {
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockResolvedValue({
        tools: [
          {
            name: 'getRemoteItem',
            description: 'Get item',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      });
      await client.connectToServer(baseConfig);
      // Reset so we can track reconnection calls separately
      mockClientConnect.mockReset();
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockReset();
      mockClientListTools.mockResolvedValue({
        tools: [
          {
            name: 'getRemoteItem',
            description: 'Get item',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
      });
    }

    it('should reconnect and retry when remote returns 404 (StreamableHTTPError)', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'success' }] });
      });

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', { id: 'E123' });

      // Should have reconnected (new connect call) and retried
      expect(mockClientConnect).toHaveBeenCalled();
      expect(callCount).toBe(2);
      expect(result.content![0].text).toBe('success');
    });

    it('should reconnect via structural .code check when instanceof fails', async () => {
      await connectClient();

      // Simulate a StreamableHTTPError-shaped error that fails instanceof
      // (e.g., bundler duplication creates a second copy of the class)
      class DuplicateStreamableHTTPError extends Error {
        code: number;
        constructor(code: number, message: string) {
          super(`Streamable HTTP error: ${message}`);
          this.code = code;
        }
      }
      const structuralError = new DuplicateStreamableHTTPError(404, 'Not Found');

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(structuralError);
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(mockClientConnect).toHaveBeenCalled();
      expect(result.content![0].text).toBe('ok');
    });

    it('should reconnect when error message contains "Session not found"', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'recovered' }] });
      });

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(mockClientConnect).toHaveBeenCalled();
      expect(result.content![0].text).toBe('recovered');
    });

    it('should return error when reconnection itself fails', async () => {
      await connectClient();

      mockClientCallTool.mockRejectedValue(new MockStreamableHTTPError(404, 'Session not found'));
      // Make reconnect fail
      mockClientConnect.mockRejectedValue(new Error('Server unreachable'));

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('session expired and reconnection failed');
      // The server should be in error state — reconnectServer deletes the old connection
      // before attempting to re-establish, and since reconnection failed, connectionStatus
      // is set to 'error'. getConnectionStatus surfaces error-state servers even without
      // an active connection entry.
      const status = client.getConnectionStatus();
      expect(status['test-server']).toBe('error');
    });

    it('should report retry tool error accurately when reconnection succeeds but retry fails', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        // Retry fails with a non-session error
        return Promise.reject(new Error('Invalid parameter: workspace'));
      });

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(result.isError).toBe(true);
      // Should NOT say "reconnection failed" — reconnection succeeded, the tool call failed
      expect(result.content![0].text).toContain('Invalid parameter: workspace');
      expect(result.content![0].text).not.toContain('reconnection failed');
    });

    it('should re-discover tools after reconnection', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      // discoverTools calls listTools during reconnection to refresh the tool catalog
      expect(mockClientListTools).toHaveBeenCalled();
    });

    it('should not reconnect for non-session errors', async () => {
      await connectClient();

      mockClientCallTool.mockRejectedValue(new Error('Invalid parameter: workspace'));

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      // Should NOT have tried to reconnect
      expect(mockClientConnect).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('Invalid parameter');
    });

    it('should not reconnect for non-404 StreamableHTTPErrors', async () => {
      await connectClient();

      mockClientCallTool.mockRejectedValue(
        new MockStreamableHTTPError(500, 'Internal server error'),
      );

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(mockClientConnect).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
    });

    it('should not false-positive on unrelated errors containing "-32001"', async () => {
      await connectClient();

      mockClientCallTool.mockRejectedValue(new Error('Request timeout -32001'));

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      // Should NOT reconnect — the message does not match the "Session not found" pattern
      expect(mockClientConnect).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
    });

    it('should surface a specific message when retry also fails with session expiry', async () => {
      await connectClient();

      // Every callTool invocation returns a session-not-found error — the server
      // cannot maintain sessions at all
      mockClientCallTool.mockRejectedValue(new MockStreamableHTTPError(404, 'Session not found'));

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('session expired again immediately');
      expect(result.content![0].text).toContain('unable to maintain sessions');
    });

    it('should not reconnect for a plain error with .code = 404 that is not StreamableHTTPError-shaped', async () => {
      await connectClient();

      // A non-StreamableHTTPError with .code = 404 (e.g., an application JSON-RPC error)
      // should NOT trigger reconnection after tightening the structural check
      const appError = new Error('Resource not found') as Error & { code: number };
      appError.code = 404;

      mockClientCallTool.mockRejectedValue(appError);

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(mockClientConnect).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
    });

    it('should not reconnect for a non-404 StreamableHTTPError whose body contains "Session not found"', async () => {
      await connectClient();

      // A 500 error whose response body happens to contain "Session not found"
      // should NOT trigger reconnection — only 404 is a session expiry signal
      mockClientCallTool.mockRejectedValue(new MockStreamableHTTPError(500, 'Session not found'));

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(mockClientConnect).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
    });

    it('should coalesce concurrent reconnection attempts for the same server', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      // Fire two tool calls concurrently — both should hit 404 and attempt reconnection,
      // but only one reconnectServer call should actually execute
      await Promise.all([
        client.executeRemoteTool('test-server', 'getRemoteItem', { id: '1' }),
        client.executeRemoteTool('test-server', 'getRemoteItem', { id: '2' }),
      ]);

      // reconnectServer calls connectViaHttp which calls client.connect — should only
      // have been called once despite two concurrent reconnection triggers
      expect(mockClientConnect).toHaveBeenCalledTimes(1);
    });

    it('should reconnect via constructor name when message prefix does not match', async () => {
      await connectClient();

      // Error whose constructor.name is StreamableHTTPError but message does NOT
      // start with "Streamable HTTP error" — exercises the constructor-name sub-branch
      class StreamableHTTPError extends Error {
        code: number;
        constructor(code: number, message: string) {
          super(message); // no "Streamable HTTP error:" prefix
          this.code = code;
        }
      }

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new StreamableHTTPError(404, 'Not Found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(mockClientConnect).toHaveBeenCalled();
      expect(result.content![0].text).toBe('ok');
    });

    it('should succeed even when old transport close throws during reconnection', async () => {
      await connectClient();

      // Make transport.close() throw to simulate a dead transport
      mockTransportClose.mockImplementation(() => {
        throw new Error('Transport already closed');
      });

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'recovered' }] });
      });

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      // Reconnection should succeed despite transport close failure
      expect(mockClientConnect).toHaveBeenCalled();
      expect(result.content![0].text).toBe('recovered');
    });

    it('should return structured error when server has no connection entry', async () => {
      // Do NOT connect — call executeRemoteTool on an unknown server
      const result = await client.executeRemoteTool('unknown-server', 'someTool', {});

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('no connection to unknown-server');
    });

    it('should reconnect when a non-Error throwable contains "Session not found"', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // A thrown string (not an Error instance) exercises the String(error)
          // path in isSessionExpired — this test's entire point is a non-Error
          // rejection, so the lint rule is intentionally overridden here rather
          // than worked around (which would defeat the test).
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject('Session not found');
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(mockClientConnect).toHaveBeenCalled();
      expect(result.content![0].text).toBe('ok');
    });

    it('should return error when discoverTools fails during reconnection', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      // connectViaHttp succeeds but listTools (used by discoverTools) fails
      mockClientConnect.mockResolvedValue(undefined);
      mockClientListTools.mockRejectedValue(
        new Error('listTools: 503 Service Unavailable'),
      );

      const result = await client.executeRemoteTool('test-server', 'getRemoteItem', {});

      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('session expired and reconnection failed');
      expect(result.content![0].text).toContain('503 Service Unavailable');
    });

    it('should verify both concurrent callers succeed after coalesced reconnection', async () => {
      await connectClient();

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      const [result1, result2] = await Promise.all([
        client.executeRemoteTool('test-server', 'getRemoteItem', { id: '1' }),
        client.executeRemoteTool('test-server', 'getRemoteItem', { id: '2' }),
      ]);

      expect(mockClientConnect).toHaveBeenCalledTimes(1);
      // Both callers should succeed after the shared reconnection
      expect(result1.isError ?? false).toBe(false);
      expect(result2.isError ?? false).toBe(false);
    });

    it('should abort reconnection if client is disconnected mid-reconnect', async () => {
      await connectClient();

      // Make connect hang so we can disconnect mid-reconnect
      let connectResolve: () => void;
      mockClientConnect.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            connectResolve = resolve;
          }),
      );

      mockClientCallTool.mockRejectedValue(new MockStreamableHTTPError(404, 'Session not found'));

      // Start the tool call — it will enter the reconnection path and block on connect
      const toolPromise = client.executeRemoteTool('test-server', 'getRemoteItem', {});

      // Give the reconnection a tick to start, then disconnect.
      // disconnect() now awaits in-flight reconnection promises, so we must
      // resolve the blocked connect concurrently to avoid a deadlock.
      await new Promise((r) => setTimeout(r, 10));
      const disconnectPromise = client.disconnect();
      connectResolve!();
      await disconnectPromise;

      const result = await toolPromise;
      expect(result.isError).toBe(true);
      expect(result.content![0].text).toContain('session expired and reconnection failed');
    });

    it('should wait for in-flight reconnection when new call finds no connection', async () => {
      await connectClient();

      // Make reconnection take a moment so we can fire a second call during it
      let connectResolve: () => void;
      const connectPromise = new Promise<void>((resolve) => {
        connectResolve = resolve;
      });

      let callCount = 0;
      mockClientCallTool.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new MockStreamableHTTPError(404, 'Session not found'));
        }
        return Promise.resolve({ content: [{ type: 'text', text: 'ok' }] });
      });

      mockClientConnect.mockImplementation(async () => {
        await connectPromise;
      });

      // First call triggers reconnection (which blocks on connectPromise)
      const firstCall = client.executeRemoteTool('test-server', 'getRemoteItem', { id: '1' });

      // Give the reconnection a tick to start (deletes the connection entry)
      await new Promise((r) => setTimeout(r, 10));

      // Second call arrives while reconnection is in progress — no connection entry exists
      // It should wait for the reconnect promise instead of returning "no connection" immediately
      const secondCall = client.executeRemoteTool('test-server', 'getRemoteItem', { id: '2' });

      // Resolve the reconnection
      connectResolve!();

      const [result1, result2] = await Promise.all([firstCall, secondCall]);

      // Both should succeed — second call waited for the in-flight reconnection
      expect(result1.isError ?? false).toBe(false);
      expect(result2.isError ?? false).toBe(false);
    });
  });

  describe('categorizeRemoteTool', () => {
    it('returns Remote category for all remote tools', async () => {
      // Import directly to test the real function, not the mocked module
      const { categorizeRemoteTool } = await import('./remote-mcp-client');

      const result = categorizeRemoteTool({
        name: 'k6-get-stories',
        description: 'Get k6 stories',
        parameters: {},
        serverId: 'k6',
        serverName: 'k6',
        annotations: {},
      });
      expect(result).toBe('Remote');
    });

    it('does not return Uncategorized for remote tools', async () => {
      const { categorizeRemoteTool } = await import('./remote-mcp-client');

      const result = categorizeRemoteTool({
        name: 'any-tool',
        description: 'Any tool',
        parameters: {},
        serverId: 'any-server',
        serverName: 'Any Server',
        annotations: {},
      });
      expect(result).not.toBe('Uncategorized');
    });
  });
});

/**
 * A static-bearer service definition owned by the tests.
 *
 * The shipped SERVICE_AUTH_MAP is empty — the only service that used it was
 * removed along with the gateway-routed servers — so the mechanism is exercised
 * against this synthetic entry, injected rather than mocked at module level.
 */
const TEST_AUTH_MAP = {
  'partner-api': {
    headerName: 'Authorization',
    envVar: 'PARTNER_API_TOKEN',
    valueTemplate: 'Bearer ${value}',
  },
};

describe('createStaticBearerFetch', () => {
  setupStandardMocks();

  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.PARTNER_API_TOKEN = process.env.PARTNER_API_TOKEN;
  });

  afterEach(() => {
    if (savedEnv.PARTNER_API_TOKEN === undefined) {
      delete process.env.PARTNER_API_TOKEN;
    } else {
      process.env.PARTNER_API_TOKEN = savedEnv.PARTNER_API_TOKEN;
    }
  });

  it('attaches templated header from SERVICE_AUTH_MAP value when env var is set', async () => {
    process.env.PARTNER_API_TOKEN = 'sk-test-123';
    const { createStaticBearerFetch } = await import('./remote-mcp-client');
    const fetchFn = createStaticBearerFetch('partner-api', TEST_AUTH_MAP);

    let observedHeaders: Record<string, string> | undefined;
    const realFetch = global.fetch;
    global.fetch = mock((_url: string | URL, init?: RequestInit) => {
      observedHeaders = init?.headers as Record<string, string>;
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    try {
      await fetchFn('https://mcp.partner.example.com/');
      expect(observedHeaders).toBeDefined();
      expect(observedHeaders!['Authorization']).toBe('Bearer sk-test-123');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('throws when the env var is unset', async () => {
    delete process.env.PARTNER_API_TOKEN;
    const { createStaticBearerFetch } = await import('./remote-mcp-client');
    const fetchFn = createStaticBearerFetch('partner-api', TEST_AUTH_MAP);

    let caught: Error | undefined;
    try {
      await fetchFn('https://mcp.partner.example.com/');
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('PARTNER_API_TOKEN');
  });

  it('throws when the env var is whitespace-only', async () => {
    process.env.PARTNER_API_TOKEN = '   ';
    const { createStaticBearerFetch } = await import('./remote-mcp-client');
    const fetchFn = createStaticBearerFetch('partner-api', TEST_AUTH_MAP);

    let caught: Error | undefined;
    try {
      await fetchFn('https://mcp.partner.example.com/');
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('PARTNER_API_TOKEN');
  });

  it('throws at construction time when serviceId is not in SERVICE_AUTH_MAP', async () => {
    const { createStaticBearerFetch } = await import('./remote-mcp-client');

    let caught: Error | undefined;
    try {
      createStaticBearerFetch('not-a-real-service', TEST_AUTH_MAP);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain('SERVICE_AUTH_MAP');
    expect(caught!.message).toContain('not-a-real-service');
  });

  it('does not attach x-gateway-auth (platform JWT must not leak to external partners)', async () => {
    process.env.PARTNER_API_TOKEN = 'sk-test-123';
    const { createStaticBearerFetch } = await import('./remote-mcp-client');
    const fetchFn = createStaticBearerFetch('partner-api', TEST_AUTH_MAP);

    let observedHeaders: Record<string, string> | undefined;
    const realFetch = global.fetch;
    global.fetch = mock((_url: string | URL, init?: RequestInit) => {
      observedHeaders = init?.headers as Record<string, string>;
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    try {
      await fetchFn('https://mcp.partner.example.com/');
      expect(observedHeaders).toBeDefined();
      expect(observedHeaders!['x-gateway-auth']).toBeUndefined();
    } finally {
      global.fetch = realFetch;
    }
  });

  it('strips SDK-injected lowercase authorization so the static header wins', async () => {
    process.env.PARTNER_API_TOKEN = 'sk-test-123';
    const { createStaticBearerFetch } = await import('./remote-mcp-client');
    const fetchFn = createStaticBearerFetch('partner-api', TEST_AUTH_MAP);

    let observedHeaders: Record<string, string> | undefined;
    const realFetch = global.fetch;
    global.fetch = mock((_url: string | URL, init?: RequestInit) => {
      observedHeaders = init?.headers as Record<string, string>;
      return Promise.resolve(new Response('ok', { status: 200 }));
    }) as unknown as typeof fetch;

    try {
      await fetchFn('https://mcp.partner.example.com/', {
        headers: { authorization: 'Bearer should-be-stripped' },
      });
      expect(observedHeaders).toBeDefined();
      expect(observedHeaders!['Authorization']).toBe('Bearer sk-test-123');
      expect(observedHeaders!['authorization']).toBeUndefined();
    } finally {
      global.fetch = realFetch;
    }
  });
});
