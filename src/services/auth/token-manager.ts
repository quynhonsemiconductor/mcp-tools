/**
 * Generic token manager for OAuth providers.
 *
 * Handles token acquisition, refresh, and lifecycle management.
 * Coordinates between environment variables, token store, and OAuth handler.
 */

import { logDebug, logInfo, logWarn } from '../logger';
import type { OAuthHandler } from './oauth-handler';
import type { TokenStore } from './token-store';
import { OAuthError } from './types';
import type { StoredToken } from './types';

/**
 * Time window before token expiry to proactively refresh (15 minutes in ms).
 * This aligns with industry standards (AWS/Azure use ~5-15 min).
 */
export const PROACTIVE_REFRESH_THRESHOLD_MS = 15 * 60 * 1000;

/**
 * Check if a token should be proactively refreshed.
 * Returns true if token expires within the refresh threshold window.
 */
export function shouldRefreshToken(token: StoredToken): boolean {
  if (!token.expiresAt || !token.refreshToken) {
    return false;
  }
  const timeUntilExpiry = token.expiresAt - Date.now();
  return timeUntilExpiry > 0 && timeUntilExpiry < PROACTIVE_REFRESH_THRESHOLD_MS;
}

/**
 * Options for {@link TokenManager.getToken}.
 */
export interface GetTokenOptions {
  /** If true, clears any stored token and forces a new OAuth flow. */
  forceRefresh?: boolean;
  /**
   * If false, skip interactive OAuth flows (e.g. opening a browser).
   * Only env-var and stored keyring tokens will be returned.
   * @default true
   */
  interactive?: boolean;
}

/**
 * Dependencies for TokenManager - enables dependency injection for testing.
 */
export interface TokenManagerDependencies {
  tokenStore: TokenStore;
  oauthHandler: OAuthHandler;
  getEnvToken: () => string | undefined;
  providerName: string;
}

/**
 * Generic token manager for OAuth providers.
 *
 * Manages the full token lifecycle including:
 * - Environment variable tokens (highest priority)
 * - Stored OAuth tokens with proactive refresh
 * - Auto-initiation of OAuth flow when needed
 */
export class TokenManager {
  private tokenStore: TokenStore;
  private oauthHandler: OAuthHandler;
  private getEnvToken: () => string | undefined;
  private providerName: string;

  /**
   * Async lock chain to prevent concurrent token refresh operations.
   *
   * This implements a promise-chaining mutex pattern: each refresh operation
   * awaits the previous one before executing, ensuring serialized access
   * without blocking the event loop.
   */
  private refreshLock: Promise<void> = Promise.resolve();
  /** Cached result from the current refresh operation */
  private refreshResult: Promise<string | null> | null = null;

  /**
   * Create a new TokenManager.
   *
   * @param deps - Dependencies for the token manager
   */
  constructor(deps: TokenManagerDependencies) {
    this.tokenStore = deps.tokenStore;
    this.oauthHandler = deps.oauthHandler;
    this.getEnvToken = deps.getEnvToken;
    this.providerName = deps.providerName;
  }

  /**
   * Get a valid access token.
   *
   * Priority order:
   * 1. Environment variable token
   * 2. Stored OAuth token (with proactive refresh if expiring soon)
   * 3. Auto-initiate OAuth flow if configured (skipped when interactive is false)
   *
   * @param options - Boolean (legacy: forceRefresh) or options object
   * @returns A valid access token
   * @throws Error if no token is available and OAuth is not configured/allowed
   */
  async getToken(options?: boolean | GetTokenOptions): Promise<string> {
    const forceRefresh = typeof options === 'boolean' ? options : (options?.forceRefresh ?? false);
    const interactive = typeof options === 'boolean' ? true : (options?.interactive ?? true);

    // Priority 1: Environment variable (never force refresh env tokens)
    const envToken = this.getEnvToken();
    if (envToken) {
      return envToken;
    }

    // Priority 2: Stored OAuth token (unless force refresh)
    if (!forceRefresh) {
      const token = await this.getStoredToken();
      if (token) {
        return token;
      }
    } else {
      // Clear stored token when forcing refresh
      logInfo(`Clearing stored ${this.providerName} token due to authentication failure`);
      await this.tokenStore.clearAll();
    }

    // Priority 3: Auto-initiate OAuth flow if configured
    if (!interactive) {
      throw new Error(
        `${this.providerName} authentication required. No stored token available and interactive OAuth is disabled.`,
      );
    }
    return this.initiateOAuthFlow();
  }

  /**
   * Get a valid token from the store, handling expiration and proactive refresh.
   *
   * @returns Access token string or null if no valid token available
   */
  private async getStoredToken(): Promise<string | null> {
    const storedToken = await this.tokenStore.getToken();

    if (!storedToken) {
      return null;
    }

    // Check if token is expired
    if (storedToken.expiresAt && Date.now() > storedToken.expiresAt) {
      logDebug(`${this.providerName} token expired`);
      // Try to refresh if we have a refresh token
      if (storedToken.refreshToken) {
        const refreshedToken = await this.tryProactiveRefresh(storedToken);
        if (refreshedToken) {
          return refreshedToken;
        }
      }
      // Token expired and can't refresh - return null to trigger OAuth flow
      return null;
    }

    // Check if token should be proactively refreshed
    if (shouldRefreshToken(storedToken)) {
      const refreshedToken = await this.tryProactiveRefresh(storedToken);
      if (refreshedToken) {
        return refreshedToken;
      }
      // If proactive refresh fails, return current token (still valid)
      return storedToken.accessToken;
    }

    // Token is valid and not in refresh window
    return storedToken.accessToken;
  }

  /**
   * Attempt to refresh a token proactively.
   * Uses an async lock pattern to prevent concurrent refresh operations.
   *
   * @returns The new access token if refresh succeeded, null otherwise
   */
  private async tryProactiveRefresh(token: StoredToken): Promise<string | null> {
    if (!token.refreshToken) {
      return null;
    }

    if (!this.oauthHandler.isConfigured()) {
      return null;
    }

    // If a refresh is already in progress, wait for the existing result
    if (this.refreshResult) {
      logDebug('Token refresh already in progress, waiting for existing refresh');
      return this.refreshResult;
    }

    // Create the refresh result promise before acquiring lock
    let resolveRefresh: (value: string | null) => void;
    this.refreshResult = new Promise((resolve) => {
      resolveRefresh = resolve;
    });

    // Chain onto the lock to serialize refresh operations
    const previousLock = this.refreshLock;
    this.refreshLock = (async () => {
      await previousLock;
      try {
        const result = await this.executeTokenRefresh(token);
        resolveRefresh!(result);
      } catch {
        resolveRefresh!(null);
      } finally {
        this.refreshResult = null;
      }
    })();

    return this.refreshResult;
  }

  /**
   * Execute the actual token refresh operation.
   */
  private async executeTokenRefresh(token: StoredToken): Promise<string | null> {
    try {
      logDebug(`Proactively refreshing ${this.providerName} token before expiry`);
      const newToken = await this.oauthHandler.refreshAccessToken(token.refreshToken!);

      // Preserve original user/metadata if not returned by refresh
      const updatedToken: StoredToken = {
        ...newToken,
        userId: newToken.userId || token.userId,
        scope: newToken.scope || token.scope,
        metadata: { ...token.metadata, ...newToken.metadata },
      };

      await this.tokenStore.storeToken(updatedToken.userId, updatedToken);
      logInfo(`Proactively refreshed ${this.providerName} token`);
      return updatedToken.accessToken;
    } catch (err) {
      // Check if this is an unrecoverable auth error
      const authErrors = [
        'token_revoked',
        'invalid_refresh_token',
        'invalid_auth',
        'invalid_grant',
      ];
      const providerError = err instanceof OAuthError ? err.providerError : undefined;
      if (providerError && authErrors.includes(providerError)) {
        logWarn(`Refresh token is invalid (${providerError}), clearing stored token`);
        await this.tokenStore.clearAll();
        return null;
      }
      // Log but don't fail - the current token may still be valid
      const message = err instanceof Error ? err.message : String(err);
      logWarn(`Proactive token refresh failed: ${message}`);
      return null;
    }
  }

  /**
   * Initiate OAuth flow to get a new token.
   *
   * @throws Error if OAuth is not configured or flow fails
   */
  private async initiateOAuthFlow(): Promise<string> {
    if (!this.oauthHandler.isConfigured()) {
      throw new Error(
        `${this.providerName} authentication required. Set environment token or configure OAuth client credentials.`,
      );
    }

    logInfo(`No ${this.providerName} token found, initiating OAuth flow...`);
    const result = await this.oauthHandler.startOAuthFlow();

    if (result.success && result.token) {
      // Store the token in the keyring
      await this.tokenStore.storeToken(result.token.userId, result.token);
      logInfo(`${this.providerName} OAuth completed for user ${result.token.userId}`);
      return result.token.accessToken;
    }

    throw new Error(
      result.error?.trim() || `${this.providerName} OAuth flow failed. Please try again.`,
    );
  }
}
