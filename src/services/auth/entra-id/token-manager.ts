/**
 * Entra ID Token Manager.
 *
 * Handles token acquisition, refresh, and lifecycle management for Entra ID SSO.
 * Coordinates between environment variables, token store, and OAuth handler.
 *
 * Follows the same provider pattern as GitHubTokenManager.
 */

import { TokenManager, TokenStore, type TokenManagerDependencies } from '..';
import { loadEntraIdConfig } from './config';
import { getEntraIdOAuthHandler } from './oauth-handler';
import { discoverOidcEndpoints } from './oidc-discovery';
import type { EntraIdConfig } from './types';

/**
 * Service name for Entra ID credential storage in the OS keyring.
 */
const KEYRING_SERVICE = 'qnsc-mcp-entra-id';

/**
 * Entra ID token manager.
 *
 * Manages the full token lifecycle including:
 * - Environment variable tokens (ENTRA_ACCESS_TOKEN — highest priority)
 * - Stored OAuth tokens with proactive refresh
 * - Auto-initiation of browser-based SSO flow when needed
 */
export class EntraIdTokenManager extends TokenManager {
  /**
   * Create a new EntraIdTokenManager.
   *
   * Because OIDC discovery is async, the handler and config must be
   * pre-resolved and passed in. Use {@link createEntraIdTokenManager}
   * for the standard async construction path.
   *
   * @param deps - Optional dependency overrides for testing
   */
  constructor(
    deps: Partial<Omit<TokenManagerDependencies, 'providerName'>> & {
      entraConfig: EntraIdConfig;
      authorizeUrl: string;
      tokenUrl: string;
    },
  ) {
    const tokenStore = deps.tokenStore ?? new TokenStore(KEYRING_SERVICE);
    const oauthHandler =
      deps.oauthHandler ??
      getEntraIdOAuthHandler(deps.entraConfig, deps.authorizeUrl, deps.tokenUrl);
    const getEnvToken =
      deps.getEnvToken ??
      (() => {
        const token = process.env.ENTRA_ACCESS_TOKEN?.trim();
        return token || undefined;
      });

    super({
      tokenStore,
      oauthHandler,
      getEnvToken,
      providerName: 'Entra ID',
    });
  }
}

/**
 * Create an EntraIdTokenManager with OIDC-discovered endpoints.
 *
 * This is the standard async factory since OIDC discovery must complete
 * before the handler can be constructed.
 *
 * @param configOverride - Optional config override (uses loadEntraIdConfig() by default)
 * @returns A fully initialized EntraIdTokenManager
 */
export async function createEntraIdTokenManager(
  configOverride?: EntraIdConfig,
): Promise<EntraIdTokenManager> {
  const config = configOverride ?? loadEntraIdConfig();
  const oidc = await discoverOidcEndpoints(config.tenantId);

  return new EntraIdTokenManager({
    entraConfig: config,
    authorizeUrl: oidc.authorization_endpoint,
    tokenUrl: oidc.token_endpoint,
  });
}

// Singleton instance
let instance: EntraIdTokenManager | null = null;
let initPromise: Promise<EntraIdTokenManager> | null = null;

/**
 * Get the singleton Entra ID token manager instance.
 *
 * Performs OIDC discovery on first call; subsequent calls return the
 * cached instance. Concurrent callers share the same initialization promise.
 *
 * @returns The singleton EntraIdTokenManager
 */
export async function getEntraIdTokenManager(): Promise<EntraIdTokenManager> {
  if (instance) return instance;

  if (!initPromise) {
    initPromise = createEntraIdTokenManager()
      .then((mgr) => {
        instance = mgr;
        initPromise = null;
        return mgr;
      })
      .catch((err) => {
        // Reset so the next caller can retry instead of getting a cached rejection
        initPromise = null;
        throw err;
      });
  }

  return initPromise;
}

/**
 * Force re-authentication by clearing stored tokens and triggering a fresh SSO login.
 *
 * Clears all Entra ID tokens from the OS keychain and initiates a new browser-based
 * SSO login flow. Useful for troubleshooting auth issues, switching accounts, or
 * recovering from revoked tokens (FR-023, SC-007).
 *
 * @returns The new access token from the fresh SSO login
 */
export async function reauthenticate(): Promise<string> {
  const manager = await getEntraIdTokenManager();
  return manager.getToken({ forceRefresh: true });
}

/**
 * Reset the singleton instance for testing purposes.
 *
 * @internal Should only be used in test files
 */
export function resetEntraIdTokenManagerForTesting(): void {
  instance = null;
  initPromise = null;
}
