/**
 * Common OAuth types and interfaces used across providers.
 *
 * This module provides the foundation for multi-provider OAuth support,
 * allowing consistent handling of tokens, configuration, and flows while
 * enabling provider-specific customization.
 */

/**
 * Stored OAuth token data for any provider.
 *
 * @property accessToken - The access token for API calls
 * @property refreshToken - Optional refresh token for obtaining new access tokens
 * @property userId - The user ID from the provider
 * @property scope - Space or comma-separated list of OAuth scopes granted
 * @property createdAt - Unix timestamp when the token was created
 * @property expiresAt - Optional Unix timestamp when the token expires
 * @property metadata - Provider-specific metadata (team ID, workspace, etc.)
 */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  userId: string;
  scope: string;
  createdAt: number;
  expiresAt?: number;
  metadata?: Record<string, any>;
}

/**
 * OAuth configuration for a provider.
 *
 * @property clientId - OAuth client ID
 * @property clientSecret - OAuth client secret
 * @property isConfigured - Whether credentials are available
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  isConfigured: boolean;
}

/**
 * OAuth flow result.
 *
 * @property success - Whether the OAuth flow succeeded
 * @property token - The resulting token if successful
 * @property error - Error message if unsuccessful
 */
export interface OAuthResult {
  success: boolean;
  token?: StoredToken;
  error?: string;
}

/**
 * Custom error class for OAuth errors.
 * Provides type-safe error handling with provider-specific error codes.
 */
export class OAuthError extends Error {
  /** Provider API error code (e.g., 'invalid_auth', 'token_revoked') */
  public readonly providerError?: string;
  /** Network or system error code (e.g., 'ECONNREFUSED', 'ETIMEDOUT') */
  public readonly code?: string;

  /**
   * Create a new OAuthError.
   *
   * @param message - Human-readable error message
   * @param providerError - Provider API error code
   * @param code - Network/system error code
   */
  constructor(message: string, providerError?: string, code?: string) {
    super(message);
    this.name = 'OAuthError';
    this.providerError = providerError;
    this.code = code;
  }
}

/**
 * OAuth provider configuration for dependency injection.
 *
 * @property providerName - Human-readable provider name (e.g., "GitHub", "Slack")
 * @property clientId - OAuth client ID
 * @property clientSecret - OAuth client secret
 * @property scopes - Array of OAuth scopes to request
 * @property port - Local callback server port
 * @property timeout - OAuth flow timeout in milliseconds
 * @property authorizeUrl - Provider's authorization endpoint
 * @property tokenUrl - Provider's token exchange endpoint
 */
export interface OAuthProviderConfig {
  providerName: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  port: number;
  timeout: number;
  authorizeUrl: string;
  tokenUrl: string;
  callbackPath?: string;
  /** Whether to use PKCE (Proof Key for Code Exchange). Defaults to true. Set to false for providers that don't support PKCE. */
  supportsPkce?: boolean;
}

/**
 * Success result from getAuthUrlOnly.
 */
export interface GetAuthUrlSuccess {
  success: true;
  url: string;
  state: string;
  codeVerifier: string;
  resultPromise: Promise<OAuthResult>;
}

/**
 * Error result from getAuthUrlOnly.
 */
export interface GetAuthUrlError {
  success: false;
  error: string;
}

/**
 * Result type for getAuthUrlOnly - discriminated union for easy type narrowing.
 */
export type GetAuthUrlResult = GetAuthUrlSuccess | GetAuthUrlError;

/**
 * Interface for keyring operations.
 * Allows for mocking and testing of credential storage.
 */
export interface KeyringEntry {
  getPassword(): string | null;
  setPassword(password: string): void;
  deletePassword(): void;
}

/**
 * Constructor type for creating KeyringEntry instances.
 */
export interface KeyringEntryConstructor {
  new (service: string, name: string): KeyringEntry;
}

/**
 * Generic OAuth token response structure from provider token endpoints.
 * Providers return different field names, so this interface provides common patterns.
 *
 * @property access_token - OAuth access token
 * @property refresh_token - Optional refresh token
 * @property expires_in - Token lifetime in seconds
 * @property scope - Granted scopes (space or comma-separated)
 * @property token_type - Token type (usually "Bearer")
 * @property error - Error code if request failed
 * @property error_description - Human-readable error description
 */
export interface GenericOAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Generic user info structure from provider user endpoints.
 * Subclasses extend this with provider-specific fields.
 *
 * @property id - User ID (provider-specific field name)
 * @property login - Username (provider-specific field name)
 * @property name - Display name
 * @property email - User email
 */
export interface GenericUserInfo {
  id?: string;
  login?: string;
  name?: string;
  email?: string;
  [key: string]: any; // Allow provider-specific fields
}
