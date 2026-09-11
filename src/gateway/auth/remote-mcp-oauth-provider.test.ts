/**
 * remote-mcp-oauth-provider.test.ts - Tests for RemoteMcpOauthProvider
 */
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { RemoteMCPServerConfig } from '../remote-mcp-client';
import { logInfo } from '../../services/logger';

// Mock keyring entry for testing
class MockKeyringEntry {
  private static storage: Map<string, string> = new Map();

  constructor(
    private service: string,
    private account: string,
  ) {}

  getPassword(): string | null {
    const key = `${this.service}:${this.account}`;
    return MockKeyringEntry.storage.get(key) || null;
  }

  setPassword(password: string): void {
    const key = `${this.service}:${this.account}`;
    MockKeyringEntry.storage.set(key, password);
  }

  deletePassword(): void {
    const key = `${this.service}:${this.account}`;
    MockKeyringEntry.storage.delete(key);
  }

  static clear(): void {
    MockKeyringEntry.storage.clear();
  }
}

// Import real keyring pure functions before mock.module replaces them.
// These are captured at preload time in mocks.ts from the real module.
import {
  setupStandardMocks,
  realIsKeyringCorrupted,
  realGetRecoveryInstructions,
} from '../../test-utils/mocks';

// Mock the keyring-loader module — use real pure functions to avoid mock leakage
// across parallel test files (Bun's mock.module is global). mock.module()'s
// return type is `void | Promise<void>` (to match how the runtime is used
// elsewhere), but it never actually returns a pending promise here — `void`
// makes the fire-and-forget explicit rather than adding a meaningless await.
void mock.module('../../services/auth/keyring-loader', () => ({
  getKeyringEntry: () => MockKeyringEntry,
  isKeyringAvailable: () => true,
  isKeyringCorrupted: realIsKeyringCorrupted,
  getRecoveryInstructions: realGetRecoveryInstructions,
  resetKeyringLoaderForTesting: () => {},
}));
import { RemoteMcpOauthProvider, type RegistrationExtras } from './remote-mcp-oauth-provider';
import { createRegistrationCaptureFetch } from '../remote-mcp-client';

describe('RemoteMcpOauthProvider', () => {
  setupStandardMocks();

  const mockRedirectUrl = 'http://localhost:8090/callback';
  const mockClientMetadata: OAuthClientMetadata = {
    client_name: 'Test MCP Client',
    redirect_uris: [mockRedirectUrl],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  };
  const mockRemoteConfig: RemoteMCPServerConfig = {
    id: 'test-server-id',
    name: 'Test Server',
    url: 'https://test-server.example.com/mcp',
    enabled: true,
    oAuthCallbackUrl: mockRedirectUrl,
  };

  let provider: RemoteMcpOauthProvider;
  let onRedirectMock: ReturnType<typeof mock>;

  beforeEach(() => {
    MockKeyringEntry.clear();
    onRedirectMock = mock(() => {});
    provider = new RemoteMcpOauthProvider(
      mockRedirectUrl,
      mockClientMetadata,
      mockRemoteConfig,
      onRedirectMock,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  describe('constructor', () => {
    it('should create provider with all parameters', () => {
      expect(provider).toBeDefined();
      expect(provider.redirectUrl).toBe(mockRedirectUrl);
      expect(provider.clientMetadata).toEqual(mockClientMetadata);
    });

    it('should use default redirect handler when none provided', () => {
      const providerWithDefault = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
      );
      expect(providerWithDefault).toBeDefined();
    });

    it('should accept pre-configured OAuth client information from config', () => {
      const clientInfo: OAuthClientInformationMixed = {
        client_id: 'pre-configured-client-id',
        client_secret: 'pre-configured-secret',
      };
      const configWithClientInfo: RemoteMCPServerConfig = {
        ...mockRemoteConfig,
        oAuthClientInformation: clientInfo,
      };

      const providerWithClientInfo = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        configWithClientInfo,
        onRedirectMock,
      );

      expect(providerWithClientInfo.clientInformation()).toEqual(clientInfo);
    });

    it('should accept clientMetadataUrl parameter', () => {
      const metadataUrl = 'https://example.com/.well-known/oauth-client';
      const providerWithMetadataUrl = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
        metadataUrl,
      );

      expect(providerWithMetadataUrl.clientMetadataUrl).toBe(metadataUrl);
    });
  });

  describe('state', () => {
    it('should return base64 encoded remote config id', () => {
      const state = provider.state();
      expect(state).toBe(btoa(mockRemoteConfig.id));
    });

    it('should be decodable back to the original id', () => {
      const state = provider.state() as string;
      const decoded = atob(state);
      expect(decoded).toBe(mockRemoteConfig.id);
    });
  });

  describe('redirectUrl', () => {
    it('should return the configured redirect URL', () => {
      expect(provider.redirectUrl).toBe(mockRedirectUrl);
    });

    it('should accept URL object', () => {
      const urlObj = new URL(mockRedirectUrl);
      const providerWithUrlObj = new RemoteMcpOauthProvider(
        urlObj,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );
      expect(providerWithUrlObj.redirectUrl).toEqual(urlObj);
    });
  });

  describe('clientMetadata', () => {
    it('should return the configured client metadata', () => {
      expect(provider.clientMetadata).toEqual(mockClientMetadata);
    });
  });

  describe('clientInformation', () => {
    it('should return undefined when no client information is stored', () => {
      expect(provider.clientInformation()).toBeUndefined();
    });

    it('should return cached client information', () => {
      const clientInfo: OAuthClientInformationMixed = {
        client_id: 'test-client-id',
        client_secret: 'test-secret',
      };
      provider.saveClientInformation(clientInfo);

      expect(provider.clientInformation()).toEqual(clientInfo);
    });

    it('should load client information from keyring if not cached', () => {
      const clientInfo: OAuthClientInformationMixed = {
        client_id: 'keyring-client-id',
        client_secret: 'keyring-secret',
      };

      // Manually store in keyring
      const entry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      entry.setPassword(JSON.stringify(clientInfo));

      // Create new provider to test loading from keyring
      const newProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      expect(newProvider.clientInformation()).toEqual(clientInfo);
    });

    it('should prefer static config over a cached keyring entry', () => {
      const keyringClientInfo: OAuthClientInformationMixed = {
        client_id: 'keyring-client-id',
      };
      const entry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      entry.setPassword(JSON.stringify(keyringClientInfo));

      const staticClientInfo: OAuthClientInformationMixed = {
        client_id: 'static-client-id',
      };
      const configWithStaticInfo: RemoteMCPServerConfig = {
        ...mockRemoteConfig,
        oAuthClientInformation: staticClientInfo,
      };
      const newProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        configWithStaticInfo,
        onRedirectMock,
      );

      // Static config is set in the constructor, so it's returned from memory
      // without ever consulting the keyring entry.
      expect(newProvider.clientInformation()).toEqual(staticClientInfo);
    });

    it('should invalidate credentials and return undefined on JSON parse error', () => {
      // Store invalid JSON in keyring
      const entry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      entry.setPassword('invalid-json{');

      // Create new provider
      const newProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      expect(newProvider.clientInformation()).toBeUndefined();

      // Verify credentials were invalidated (deleted from keyring)
      expect(entry.getPassword()).toBeNull();
    });
  });

  describe('saveClientInformation', () => {
    it('should save client information to memory and keyring', () => {
      const clientInfo: OAuthClientInformationMixed = {
        client_id: 'new-client-id',
        client_secret: 'new-secret',
      };

      provider.saveClientInformation(clientInfo);

      // Check memory cache
      expect(provider.clientInformation()).toEqual(clientInfo);

      // Check keyring
      const entry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      expect(JSON.parse(entry.getPassword()!)).toEqual(clientInfo);
    });
  });

  describe('wasFreshlyRegistered', () => {
    it('should be false before any client information is saved', () => {
      expect(provider.wasFreshlyRegistered()).toBe(false);
    });

    it('should become true after saveClientInformation is called (fresh DCR)', () => {
      provider.saveClientInformation({ client_id: 'newly-registered-id' });
      expect(provider.wasFreshlyRegistered()).toBe(true);
    });

    it('should remain false for a provider constructed with static config', () => {
      const configWithStaticInfo: RemoteMCPServerConfig = {
        ...mockRemoteConfig,
        oAuthClientInformation: { client_id: 'static-client-id' },
      };
      const newProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        configWithStaticInfo,
        onRedirectMock,
      );

      expect(newProvider.clientInformation()).toBeDefined();
      expect(newProvider.wasFreshlyRegistered()).toBe(false);
    });

    it('should remain false for a provider that loaded client info from the keyring cache', () => {
      const entry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      entry.setPassword(JSON.stringify({ client_id: 'keyring-client-id' }));

      const newProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      expect(newProvider.clientInformation()).toBeDefined();
      expect(newProvider.wasFreshlyRegistered()).toBe(false);
    });
  });

  describe('tokens', () => {
    it('should return undefined when no tokens are stored', () => {
      expect(provider.tokens()).toBeUndefined();
    });

    it('should return cached tokens', () => {
      const tokens: OAuthTokens = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
      };
      void provider.saveTokens(tokens);

      expect(provider.tokens()).toEqual(tokens);
    });

    it('should load tokens from keyring if not cached', () => {
      const tokens: OAuthTokens = {
        access_token: 'keyring-access-token',
        token_type: 'Bearer',
        refresh_token: 'keyring-refresh-token',
      };

      // Manually store in keyring
      const entry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      entry.setPassword(JSON.stringify(tokens));

      // Create new provider to test loading from keyring
      const newProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      expect(newProvider.tokens()).toEqual(tokens);
    });

    it('should invalidate credentials and return undefined on JSON parse error', () => {
      // Store invalid JSON in keyring
      const entry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      entry.setPassword('invalid-json{');

      // Create new provider
      const newProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      expect(newProvider.tokens()).toBeUndefined();

      // Verify credentials were invalidated (deleted from keyring)
      expect(entry.getPassword()).toBeNull();
    });
  });

  describe('saveTokens', () => {
    it('should save tokens to memory and keyring', () => {
      const tokens: OAuthTokens = {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        refresh_token: 'new-refresh-token',
        expires_in: 7200,
      };

      void provider.saveTokens(tokens);

      // Check memory cache
      expect(provider.tokens()).toEqual(tokens);

      // Check keyring
      const entry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      expect(JSON.parse(entry.getPassword()!)).toEqual(tokens);
    });
  });

  describe('redirectToAuthorization', () => {
    it('should call the onRedirect callback with the authorization URL', () => {
      const authUrl = new URL('https://auth.example.com/authorize?client_id=test');

      void provider.redirectToAuthorization(authUrl);

      expect(onRedirectMock).toHaveBeenCalledWith(authUrl);
    });

    it('should use default handler that logs URL when no callback provided', () => {
      const providerWithDefault = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
      );

      const authUrl = new URL('https://auth.example.com/authorize');
      void providerWithDefault.redirectToAuthorization(authUrl);

      expect(logInfo).toHaveBeenCalled();
    });

    it('should set redirectInitiated to true when called', () => {
      expect(provider.redirectInitiated).toBe(false);

      const authUrl = new URL('https://auth.example.com/authorize');
      void provider.redirectToAuthorization(authUrl);

      expect(provider.redirectInitiated).toBe(true);
    });
  });

  describe('redirectInitiated', () => {
    it('should be false by default', () => {
      expect(provider.redirectInitiated).toBe(false);
    });

    it('should remain true after redirect is called', () => {
      const authUrl = new URL('https://auth.example.com/authorize');
      void provider.redirectToAuthorization(authUrl);

      expect(provider.redirectInitiated).toBe(true);
      // Stays true — there's no reset
      expect(provider.redirectInitiated).toBe(true);
    });
  });

  describe('codeVerifier', () => {
    it('should throw error when code verifier is not set', () => {
      expect(() => provider.codeVerifier()).toThrow('Code verifier not set');
    });

    it('should return code verifier after it is saved', () => {
      const verifier = 'test-code-verifier-12345';
      void provider.saveCodeVerifier(verifier);

      expect(provider.codeVerifier()).toBe(verifier);
    });
  });

  describe('saveCodeVerifier', () => {
    it('should save the code verifier to memory', () => {
      const verifier = 'pkce-verifier-abc123';

      void provider.saveCodeVerifier(verifier);

      expect(provider.codeVerifier()).toBe(verifier);
    });

    it('should overwrite previous code verifier', () => {
      void provider.saveCodeVerifier('first-verifier');
      void provider.saveCodeVerifier('second-verifier');

      expect(provider.codeVerifier()).toBe('second-verifier');
    });
  });

  describe('invalidateCredentials', () => {
    beforeEach(() => {
      // Set up all credentials
      const tokens: OAuthTokens = {
        access_token: 'test-token',
        token_type: 'Bearer',
      };
      const clientInfo: OAuthClientInformationMixed = {
        client_id: 'test-client',
        client_secret: 'test-secret',
      };

      void provider.saveTokens(tokens);
      provider.saveClientInformation(clientInfo);
      void provider.saveCodeVerifier('test-verifier');
    });

    it('should clear all credentials when scope is "all"', () => {
      void provider.invalidateCredentials('all');

      expect(provider.tokens()).toBeUndefined();
      expect(provider.clientInformation()).toBeUndefined();
      expect(() => provider.codeVerifier()).toThrow('Code verifier not set');

      // Check keyring is cleared
      const tokensEntry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      const clientEntry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      expect(tokensEntry.getPassword()).toBeNull();
      expect(clientEntry.getPassword()).toBeNull();
    });

    it('should clear only tokens when scope is "tokens"', () => {
      void provider.invalidateCredentials('tokens');

      expect(provider.tokens()).toBeUndefined();
      expect(provider.clientInformation()).toBeDefined();
      expect(provider.codeVerifier()).toBe('test-verifier');

      // Check only tokens keyring entry is cleared
      const tokensEntry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      const clientEntry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      expect(tokensEntry.getPassword()).toBeNull();
      expect(clientEntry.getPassword()).not.toBeNull();
    });

    it('should clear only client information when scope is "client"', () => {
      void provider.invalidateCredentials('client');

      expect(provider.tokens()).toBeDefined();
      expect(provider.clientInformation()).toBeUndefined();
      expect(provider.codeVerifier()).toBe('test-verifier');

      // Check only client keyring entry is cleared
      const tokensEntry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      const clientEntry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      expect(tokensEntry.getPassword()).not.toBeNull();
      expect(clientEntry.getPassword()).toBeNull();
    });

    it('should clear only code verifier when scope is "verifier"', () => {
      void provider.invalidateCredentials('verifier');

      expect(provider.tokens()).toBeDefined();
      expect(provider.clientInformation()).toBeDefined();
      expect(() => provider.codeVerifier()).toThrow('Code verifier not set');

      // Check keyring entries are not cleared
      const tokensEntry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      const clientEntry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);
      expect(tokensEntry.getPassword()).not.toBeNull();
      expect(clientEntry.getPassword()).not.toBeNull();
    });

    it('should remove the -registration entry when scope is "all"', () => {
      const regEntry = new MockKeyringEntry(
        'qnsc-mcp-remote',
        `${mockRemoteConfig.id}-registration`,
      );
      regEntry.setPassword(JSON.stringify({ registrationAccessToken: 'reg-tok' }));

      void provider.invalidateCredentials('all');

      expect(regEntry.getPassword()).toBeNull();
    });

    it('should remove the -registration entry when scope is "client"', () => {
      const regEntry = new MockKeyringEntry(
        'qnsc-mcp-remote',
        `${mockRemoteConfig.id}-registration`,
      );
      regEntry.setPassword(JSON.stringify({ registrationAccessToken: 'reg-tok' }));

      void provider.invalidateCredentials('client');

      expect(regEntry.getPassword()).toBeNull();
    });

    it('should NOT remove the -registration entry when scope is "tokens"', () => {
      const regEntry = new MockKeyringEntry(
        'qnsc-mcp-remote',
        `${mockRemoteConfig.id}-registration`,
      );
      regEntry.setPassword(JSON.stringify({ registrationAccessToken: 'reg-tok' }));

      void provider.invalidateCredentials('tokens');

      expect(regEntry.getPassword()).not.toBeNull();
    });
  });

  describe('optional interface methods', () => {
    it('should have addClientAuthentication as undefined by default', () => {
      expect(provider.addClientAuthentication).toBeUndefined();
    });

    it('should have prepareTokenRequest as undefined by default', () => {
      expect(provider.prepareTokenRequest).toBeUndefined();
    });
  });

  describe('keyring corruption handling', () => {
    afterEach(() => {
      // Restore the default mock so subsequent tests aren't affected
      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => MockKeyringEntry,
        isKeyringAvailable: () => true,
        isKeyringCorrupted: realIsKeyringCorrupted,
        getRecoveryInstructions: realGetRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));
    });

    it('should return undefined for tokens() when keyring throws corruption error', () => {
      // Store a token first so we know it would normally return something
      const CorruptedEntry = class extends MockKeyringEntry {
        getPassword(): string | null {
          throw new Error('errSecAuthFailed - access denied');
        }
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => CorruptedEntry,
        isKeyringAvailable: () => true,
        isKeyringCorrupted: realIsKeyringCorrupted,
        getRecoveryInstructions: realGetRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      // Should return undefined, not throw
      expect(corruptedProvider.tokens()).toBeUndefined();
    });

    it('should return undefined for clientInformation() when keyring throws corruption error', () => {
      const CorruptedEntry = class extends MockKeyringEntry {
        getPassword(): string | null {
          throw new Error('User canceled the operation');
        }
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => CorruptedEntry,
        isKeyringAvailable: () => true,
        isKeyringCorrupted: realIsKeyringCorrupted,
        getRecoveryInstructions: realGetRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      // Should return undefined, not throw
      expect(corruptedProvider.clientInformation()).toBeUndefined();
    });

    it('should not throw on saveTokens() when keyring is corrupted', () => {
      const CorruptedEntry = class extends MockKeyringEntry {
        setPassword(_password: string): void {
          throw new Error('Access is denied');
        }
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => CorruptedEntry,
        isKeyringAvailable: () => true,
        isKeyringCorrupted: realIsKeyringCorrupted,
        getRecoveryInstructions: realGetRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      const tokens: OAuthTokens = {
        access_token: 'test-token',
        token_type: 'Bearer',
      };

      // Should not throw - tokens cached in memory
      expect(() => corruptedProvider.saveTokens(tokens)).not.toThrow();

      // In-memory cache should still work
      expect(corruptedProvider.tokens()).toEqual(tokens);
    });

    it('should not throw on saveClientInformation() when keyring is corrupted', () => {
      const CorruptedEntry = class extends MockKeyringEntry {
        setPassword(_password: string): void {
          throw new Error('errSecAuthFailed');
        }
      };

      void mock.module('../../services/auth/keyring-loader', () => ({
        getKeyringEntry: () => CorruptedEntry,
        isKeyringAvailable: () => true,
        isKeyringCorrupted: realIsKeyringCorrupted,
        getRecoveryInstructions: realGetRecoveryInstructions,
        resetKeyringLoaderForTesting: () => {},
      }));

      const corruptedProvider = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        mockRemoteConfig,
        onRedirectMock,
      );

      const clientInfo: OAuthClientInformationMixed = {
        client_id: 'test-client',
        client_secret: 'test-secret',
      };

      // Should not throw - client info cached in memory
      expect(() => corruptedProvider.saveClientInformation(clientInfo)).not.toThrow();

      // In-memory cache should still work
      expect(corruptedProvider.clientInformation()).toEqual(clientInfo);
    });
  });

  describe('keyring storage isolation', () => {
    it('should use separate keyring entries for tokens and client info', () => {
      const tokens: OAuthTokens = {
        access_token: 'token-value',
        token_type: 'Bearer',
      };
      const clientInfo: OAuthClientInformationMixed = {
        client_id: 'client-value',
      };

      void provider.saveTokens(tokens);
      provider.saveClientInformation(clientInfo);

      const tokensEntry = new MockKeyringEntry('qnsc-mcp-remote', mockRemoteConfig.id);
      const clientEntry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-client`);

      // Entries should have different values
      expect(tokensEntry.getPassword()).not.toBe(clientEntry.getPassword());
      expect(JSON.parse(tokensEntry.getPassword()!)).toEqual(tokens);
      expect(JSON.parse(clientEntry.getPassword()!)).toEqual(clientInfo);
    });

    it('should use server id to isolate credentials between servers', () => {
      const config1: RemoteMCPServerConfig = {
        ...mockRemoteConfig,
        id: 'server-1',
      };
      const config2: RemoteMCPServerConfig = {
        ...mockRemoteConfig,
        id: 'server-2',
      };

      const provider1 = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        config1,
        onRedirectMock,
      );
      const provider2 = new RemoteMcpOauthProvider(
        mockRedirectUrl,
        mockClientMetadata,
        config2,
        onRedirectMock,
      );

      const tokens1: OAuthTokens = {
        access_token: 'token-1',
        token_type: 'Bearer',
      };
      const tokens2: OAuthTokens = {
        access_token: 'token-2',
        token_type: 'Bearer',
      };

      void provider1.saveTokens(tokens1);
      void provider2.saveTokens(tokens2);

      // Each provider should have its own tokens
      expect(provider1.tokens()).toEqual(tokens1);
      expect(provider2.tokens()).toEqual(tokens2);

      // Invalidating one should not affect the other
      void provider1.invalidateCredentials('tokens');
      expect(provider1.tokens()).toBeUndefined();
      expect(provider2.tokens()).toEqual(tokens2);
    });
  });

  // RFC 7592 DCR-invalidation reconciliation (see
  // mcp-auth-gateway/docs/technical/DCR_INVALIDATION_RECONCILIATION.md, Part B).
  describe('registration extras capture (createRegistrationCaptureFetch)', () => {
    const REG_ENDPOINT = 'https://auth.example.com/oauth/v2/register';
    // The MCP protocol endpoint (server baseUrl) — must differ from the AS
    // registration endpoint so protocol POSTs are the ones that get skipped.
    const MCP_ENDPOINT = 'https://test-server.example.com/mcp';
    const JSON_HEADERS = { 'Content-Type': 'application/json' };

    function readRegEntry(): RegistrationExtras | null {
      const entry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-registration`);
      const raw = entry.getPassword();
      return raw ? (JSON.parse(raw) as RegistrationExtras) : null;
    }

    function withStubbedFetch<T>(
      stub: (url: string | URL, init?: RequestInit) => Promise<Response>,
      run: () => Promise<T>,
    ): Promise<T> {
      const realFetch = global.fetch;
      global.fetch = mock(stub) as unknown as typeof fetch;
      return run().finally(() => {
        global.fetch = realFetch;
      });
    }

    it('writes extras to the -registration entry on a DCR 2xx-with-client_id response', async () => {
      const captureFetch = createRegistrationCaptureFetch(provider, MCP_ENDPOINT);
      const dcrPayload = {
        client_id: 'dcr-client-id',
        client_secret: 'dcr-secret',
        registration_access_token: 'reg-token-abc',
        registration_client_uri: `${REG_ENDPOINT}/dcr-client-id`,
        registration_expires_at: 2000000000,
      };

      await withStubbedFetch(
        () =>
          Promise.resolve(
            new Response(JSON.stringify(dcrPayload), {
              status: 201,
              headers: JSON_HEADERS,
            }),
          ),
        async () => {
          const res = await captureFetch(REG_ENDPOINT, { method: 'POST' });
          expect(res.status).toBe(201);
          // The clone-before-read must leave the original body intact for the
          // SDK's own read.
          expect(await res.json()).toEqual(dcrPayload);
        },
      );

      const stored = readRegEntry();
      expect(stored).not.toBeNull();
      expect(stored!.registrationAccessToken).toBe('reg-token-abc');
      expect(stored!.registrationClientUri).toBe(`${REG_ENDPOINT}/dcr-client-id`);
      expect(stored!.registrationExpiresAt).toBe(2000000000);
      expect(stored!.registrationEndpoint).toBe(REG_ENDPOINT);
    });

    it('does NOT capture, and leaves the body readable, for a JSON POST to the MCP protocol endpoint', async () => {
      const captureSpy = spyOn(provider, 'captureRegistrationExtras');
      const captureFetch = createRegistrationCaptureFetch(provider, MCP_ENDPOINT);
      const protocolPayload = { jsonrpc: '2.0', id: 1, result: { tools: [] } };

      await withStubbedFetch(
        () =>
          Promise.resolve(
            new Response(JSON.stringify(protocolPayload), {
              status: 200,
              headers: JSON_HEADERS,
            }),
          ),
        async () => {
          // A tools/call-shaped protocol POST to the MCP endpoint itself.
          const res = await captureFetch(MCP_ENDPOINT, { method: 'POST' });
          // The returned response body is untouched and fully readable.
          expect(await res.json()).toEqual(protocolPayload);
        },
      );

      expect(captureSpy).not.toHaveBeenCalled();
      expect(readRegEntry()).toBeNull();
    });

    it('does NOT read the body (no hang) for a text/event-stream response', async () => {
      const captureSpy = spyOn(provider, 'captureRegistrationExtras');
      const captureFetch = createRegistrationCaptureFetch(provider, MCP_ENDPOINT);

      // An SSE body whose .json() would never resolve — a ReadableStream that
      // never closes. If the wrapper tried to read it, the await would hang and
      // this test would time out.
      const neverEndingStream = new ReadableStream({
        start() {
          /* never enqueue, never close */
        },
      });

      await withStubbedFetch(
        () =>
          Promise.resolve(
            new Response(neverEndingStream, {
              status: 200,
              headers: { 'Content-Type': 'text/event-stream' },
            }),
          ),
        async () => {
          // Non-MCP URL so only the content-type gate can save us here.
          const res = await captureFetch(REG_ENDPOINT, { method: 'POST' });
          expect(res.status).toBe(200);
        },
      );

      expect(captureSpy).not.toHaveBeenCalled();
      expect(readRegEntry()).toBeNull();
    });

    it('does NOT capture on a POST 2xx that lacks a registration_access_token (pre-7592 gateway)', async () => {
      const captureFetch = createRegistrationCaptureFetch(provider, MCP_ENDPOINT);

      await withStubbedFetch(
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ client_id: 'legacy-client', client_secret: 's' }), {
              status: 201,
              headers: JSON_HEADERS,
            }),
          ),
        () => captureFetch(REG_ENDPOINT, { method: 'POST' }),
      );

      expect(readRegEntry()).toBeNull();
    });

    it('does NOT capture on a non-POST request or a body without client_id (e.g. token response)', async () => {
      const captureFetch = createRegistrationCaptureFetch(provider, MCP_ENDPOINT);

      // GET request — passes straight through.
      await withStubbedFetch(
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ client_id: 'x', registration_access_token: 'y' }), {
              status: 200,
              headers: JSON_HEADERS,
            }),
          ),
        () => captureFetch(REG_ENDPOINT, { method: 'GET' }),
      );
      expect(readRegEntry()).toBeNull();

      // Token-endpoint POST (no client_id) — passes straight through.
      await withStubbedFetch(
        () =>
          Promise.resolve(
            new Response(JSON.stringify({ access_token: 'a', token_type: 'Bearer' }), {
              status: 200,
              headers: JSON_HEADERS,
            }),
          ),
        () => captureFetch('https://auth.example.com/oauth/v2/token', { method: 'POST' }),
      );
      expect(readRegEntry()).toBeNull();
    });
  });

  describe('reconcileRegistration', () => {
    const REG_ENDPOINT = 'https://auth.example.com/oauth/v2/register';
    const CLIENT_ID = 'stored-client-id';
    const REG_URI = `${REG_ENDPOINT}/${CLIENT_ID}`;

    function seedClientAndExtras(extras: Record<string, unknown>) {
      provider.saveClientInformation({
        client_id: CLIENT_ID,
        client_secret: 'stored-secret',
      });
      const regEntry = new MockKeyringEntry(
        'qnsc-mcp-remote',
        `${mockRemoteConfig.id}-registration`,
      );
      regEntry.setPassword(JSON.stringify(extras));
    }

    function readRegEntry(): RegistrationExtras | null {
      const entry = new MockKeyringEntry('qnsc-mcp-remote', `${mockRemoteConfig.id}-registration`);
      const raw = entry.getPassword();
      return raw ? (JSON.parse(raw) as RegistrationExtras) : null;
    }

    const nowSec = () => Math.floor(Date.now() / 1000);

    it('does NOT probe when the deadline is comfortably outside the skew window', async () => {
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: nowSec() + 3600, // 1h out — well beyond SKEW (5m)
      });

      const fetchSpy = mock(() => Promise.resolve(new Response('{}', { status: 200 })));
      const realFetch = global.fetch;
      global.fetch = fetchSpy as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      expect(fetchSpy).not.toHaveBeenCalled();
      // Existing client info is untouched.
      expect(provider.clientInformation()?.client_id).toBe(CLIENT_ID);
    });

    it('invalidates credentials when no registration extras are stored (graceful degradation)', async () => {
      // Client info present, but NO -registration entry.
      provider.saveClientInformation({ client_id: CLIENT_ID });

      const fetchSpy = mock(() => Promise.resolve(new Response('{}', { status: 200 })));
      const realFetch = global.fetch;
      global.fetch = fetchSpy as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(provider.clientInformation()?.client_id).toBe(undefined);
    });

    it('refreshes only the stored deadline on a 200 probe (never touches client info)', async () => {
      const newDeadline = nowSec() + 9 * 24 * 3600; // ~9 days out
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: nowSec() + 60, // within SKEW → probe
      });

      let probedUrl: string | URL | undefined;
      let probedInit: RequestInit | undefined;
      const realFetch = global.fetch;
      global.fetch = mock((url: string | URL, init?: RequestInit) => {
        probedUrl = url;
        probedInit = init;
        return Promise.resolve(
          new Response(JSON.stringify({ registration_expires_at: newDeadline }), {
            status: 200,
          }),
        );
      }) as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      // Probed the management URI with the bearer registration token.
      expect(probedUrl).toBe(REG_URI);
      expect((probedInit?.headers as Record<string, string>)?.Authorization).toBe('Bearer tok');

      // Only the sibling deadline was rewritten — client info is intact.
      const stored = readRegEntry();
      expect(stored?.registrationExpiresAt).toBe(newDeadline);
      expect(stored?.registrationAccessToken).toBe('tok');
      expect(provider.clientInformation()?.client_id).toBe(CLIENT_ID);
    });

    it('invalidates all credentials on a 401 probe', async () => {
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: nowSec() + 60,
      });
      const invalidateSpy = spyOn(provider, 'invalidateCredentials');

      const realFetch = global.fetch;
      global.fetch = mock(() =>
        Promise.resolve(new Response('unauthorized', { status: 401 })),
      ) as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      expect(invalidateSpy).toHaveBeenCalledWith('all');
      // Client info + registration extras were cleared so the SDK re-registers.
      expect(provider.clientInformation()).toBeUndefined();
      expect(readRegEntry()).toBeNull();
    });

    it('invalidates all credentials on a 404 probe', async () => {
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: nowSec() + 60,
      });
      const invalidateSpy = spyOn(provider, 'invalidateCredentials');

      const realFetch = global.fetch;
      global.fetch = mock(() => Promise.resolve(new Response('not found', { status: 404 }))) as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      expect(invalidateSpy).toHaveBeenCalledWith('all');
      expect(provider.clientInformation()).toBeUndefined();
    });

    it('no-ops (keeps existing info) on a transient network error', async () => {
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: nowSec() + 60,
      });
      const invalidateSpy = spyOn(provider, 'invalidateCredentials');

      const realFetch = global.fetch;
      global.fetch = mock(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      expect(invalidateSpy).not.toHaveBeenCalled();
      // Existing credentials preserved for a best-effort connect.
      expect(provider.clientInformation()?.client_id).toBe(CLIENT_ID);
      expect(readRegEntry()?.registrationAccessToken).toBe('tok');
    });

    it('falls back to {registration_endpoint}/{client_id} when no management URI is stored', async () => {
      // No registrationClientUri — must derive the probe URL from the endpoint
      // (with trailing slash stripped) and the stored client_id.
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationEndpoint: `${REG_ENDPOINT}/`,
        registrationExpiresAt: nowSec() + 60, // within SKEW → probe
      });

      let probedUrl: string | URL | undefined;
      const realFetch = global.fetch;
      global.fetch = mock((url: string | URL) => {
        probedUrl = url;
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      expect(probedUrl).toBe(`${REG_ENDPOINT}/${CLIENT_ID}`);
    });

    it('keeps the stored deadline when a 200 probe returns a zero/invalid deadline', async () => {
      const original = nowSec() + 60; // within SKEW → probe
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: original,
      });

      const realFetch = global.fetch;
      global.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ registration_expires_at: 0 }), {
            status: 200,
          }),
        ),
      ) as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      // fresh > 0 guard fails → deadline is kept, not wiped.
      expect(readRegEntry()?.registrationExpiresAt).toBe(original);
    });

    it('keeps the stored deadline when a 200 probe body is unparseable', async () => {
      const original = nowSec() + 60; // within SKEW → probe
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: original,
      });

      const realFetch = global.fetch;
      global.fetch = mock(() => Promise.resolve(new Response('not json', { status: 200 }))) as unknown as typeof fetch;
      try {
        // Must not throw — the parse error is swallowed.
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      expect(readRegEntry()?.registrationExpiresAt).toBe(original);
    });

    it('proceeds without invalidating on a non-401/404 status (e.g. 500)', async () => {
      seedClientAndExtras({
        registrationAccessToken: 'tok',
        registrationClientUri: REG_URI,
        registrationExpiresAt: nowSec() + 60,
      });
      const invalidateSpy = spyOn(provider, 'invalidateCredentials');

      const realFetch = global.fetch;
      global.fetch = mock(() =>
        Promise.resolve(new Response('server error', { status: 500 })),
      ) as unknown as typeof fetch;
      try {
        await provider.reconcileRegistration();
      } finally {
        global.fetch = realFetch;
      }

      // Transient 5xx must NOT log the user out — guards against a future
      // change lumping non-401/404 into the invalidate path.
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(provider.clientInformation()?.client_id).toBe(CLIENT_ID);
      expect(readRegEntry()?.registrationAccessToken).toBe('tok');
    });
  });

  describe('static credential-management (logout support)', () => {
    const SERVER = 'logout-test-server';
    const tokenBlob = JSON.stringify({
      access_token: 't',
      token_type: 'Bearer',
    });

    it('hasStoredCredentials is false when nothing is stored', () => {
      expect(RemoteMcpOauthProvider.hasStoredCredentials(SERVER)).toBe(false);
    });

    it('hasStoredCredentials is true when only a token entry exists', () => {
      new MockKeyringEntry('qnsc-mcp-remote', SERVER).setPassword(tokenBlob);
      expect(RemoteMcpOauthProvider.hasStoredCredentials(SERVER)).toBe(true);
    });

    it('hasStoredCredentials is true when only a client-registration entry exists', () => {
      new MockKeyringEntry('qnsc-mcp-remote', `${SERVER}-client`).setPassword(
        JSON.stringify({ client_id: 'c' }),
      );
      expect(RemoteMcpOauthProvider.hasStoredCredentials(SERVER)).toBe(true);
    });

    it('clearStoredCredentials removes tokens, client info and registration extras', async () => {
      const tokenEntry = new MockKeyringEntry('qnsc-mcp-remote', SERVER);
      const clientEntry = new MockKeyringEntry('qnsc-mcp-remote', `${SERVER}-client`);
      const regEntry = new MockKeyringEntry('qnsc-mcp-remote', `${SERVER}-registration`);
      tokenEntry.setPassword(tokenBlob);
      clientEntry.setPassword(JSON.stringify({ client_id: 'c' }));
      regEntry.setPassword(JSON.stringify({ registrationAccessToken: 'r' }));

      await RemoteMcpOauthProvider.clearStoredCredentials(SERVER);

      expect(tokenEntry.getPassword()).toBeNull();
      expect(clientEntry.getPassword()).toBeNull();
      expect(regEntry.getPassword()).toBeNull();
      expect(RemoteMcpOauthProvider.hasStoredCredentials(SERVER)).toBe(false);
    });

    it('clearStoredCredentials only touches the target server id', async () => {
      const target = new MockKeyringEntry('qnsc-mcp-remote', SERVER);
      const other = new MockKeyringEntry('qnsc-mcp-remote', 'other-server');
      target.setPassword(tokenBlob);
      other.setPassword(tokenBlob);

      await RemoteMcpOauthProvider.clearStoredCredentials(SERVER);

      expect(target.getPassword()).toBeNull();
      expect(other.getPassword()).not.toBeNull();
    });
  });
});
