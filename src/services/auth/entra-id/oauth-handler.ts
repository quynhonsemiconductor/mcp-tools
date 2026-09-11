/**
 * Entra ID OAuth handler for local authorization code + PKCE flow.
 *
 * Extends the generic OAuthHandler with Entra ID–specific logic:
 * - Public client (no client_secret) per RFC 8252
 * - OIDC discovery for dynamic endpoint resolution
 * - JWT-based user info extraction (no API call needed)
 * - Entra ID–specific error messages
 */

import { OAuthError, OAuthHandler, type OAuthProviderConfig, type StoredToken } from '..';
import { logDebug, logError } from '../../logger';
import { sanitizeForLogging } from '../credential-redaction';
import { CALLBACK_PORTS } from './config';
import type { EntraIdConfig } from './types';

/**
 * Decode the payload of a JWT without validating the signature.
 *
 * This is safe for extracting user claims from an Entra ID access token that
 * was just received directly from the token endpoint over HTTPS — the token
 * has not left a trusted channel.
 *
 * @param jwt - A Base64url-encoded JWT string
 * @returns The decoded payload object, or null if decoding fails
 */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const json = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Entra ID OAuth handler for browser-based authorization code + PKCE flow.
 *
 * Key differences from a typical confidential client (e.g. GitHub):
 * - Public client — `client_secret` is never sent
 * - Endpoints resolved via OIDC discovery (not hardcoded)
 * - User info extracted from JWT claims (no user-info API needed)
 * - `offline_access` scope for refresh token issuance
 */
export class EntraIdOAuthHandler extends OAuthHandler {
  /**
   * Create a new EntraIdOAuthHandler.
   *
   * @param entraConfig - Resolved Entra ID configuration
   * @param authorizeUrl - Authorization endpoint from OIDC discovery
   * @param tokenUrl - Token endpoint from OIDC discovery
   */
  constructor(
    private readonly entraConfig: EntraIdConfig,
    authorizeUrl: string,
    tokenUrl: string,
  ) {
    const providerConfig: OAuthProviderConfig = {
      providerName: 'Entra ID',
      clientId: entraConfig.clientId,
      clientSecret: entraConfig.clientSecret || '',
      scopes: entraConfig.scopes,
      port: entraConfig.callbackPort,
      timeout: entraConfig.loginTimeoutMs,
      authorizeUrl,
      tokenUrl,
    };
    super(providerConfig);
  }

  /**
   * Return fallback ports for the callback server.
   *
   * Entra ID App Registration allows multiple redirect URIs, so the callback
   * server tries the configured port first, then falls back to the registered
   * alternative ports if the primary is occupied.
   */
  protected override getPortsToTry(): number[] {
    const primary = this.entraConfig.callbackPort;
    const fallbacks = (CALLBACK_PORTS as readonly number[]).filter((p) => p !== primary);
    return [primary, ...fallbacks];
  }

  /**
   * Entra ID callback path matching the App Registration redirect URI.
   */
  protected override getCallbackPath(): string {
    return '/cms/auth/entra/callback';
  }

  /**
   * Check if the Entra ID handler is configured.
   * Only requires clientId — Entra ID uses a public client (no secret).
   */
  override isConfigured(): boolean {
    return !!this.config.clientId;
  }

  /**
   * Public client — only send client_secret when explicitly configured.
   */
  protected override shouldSendClientSecret(): boolean {
    return !!this.config.clientSecret;
  }

  /**
   * Include explicit grant_type for Entra ID token exchange.
   */
  protected override getExtraExchangeParams(): Record<string, string> {
    return { grant_type: 'authorization_code' };
  }

  /**
   * Include scope on refresh to ensure Entra ID returns the same grants.
   */
  protected override getExtraRefreshParams(): Record<string, string> {
    return { scope: this.config.scopes.join(' ') };
  }

  /**
   * Sanitize error messages to prevent credential exposure in logs.
   */
  protected override sanitizeErrorMessage(message: string): string {
    return sanitizeForLogging(message);
  }

  /**
   * Extract user info from JWT claims in the access token.
   *
   * Entra ID access tokens are JWTs containing standard OIDC claims.
   * We decode without verifying the signature since the token was received
   * directly from the token endpoint over HTTPS.
   *
   * @param accessToken - The JWT access token
   * @returns User info with userId, name, and email from JWT claims
   */
  protected override getUserInfo(accessToken: string): Promise<{
    userId: string;
    name?: string;
    email?: string;
    [key: string]: any;
  }> {
    const claims = decodeJwtPayload(accessToken);

    if (!claims) {
      logError('Failed to decode Entra ID access token JWT');
      throw new OAuthError('Failed to decode access token', undefined, 'USER_INFO_FAILED');
    }

    // Entra ID JWT claims:
    // - oid: Object ID (unique per user per tenant, stable)
    // - preferred_username: UPN (e.g. user@domain.com)
    // - name: Display name
    // - email: Email address (may not always be present)
    // - sub: Subject (unique per user per app registration)
    const userId = (claims.oid as string) || (claims.sub as string) || '';
    if (!userId) {
      logError('Entra ID JWT missing both oid and sub claims');
      throw new OAuthError(
        'Access token missing user identifier claims',
        undefined,
        'USER_INFO_FAILED',
      );
    }

    logDebug(`Extracted user info from JWT: oid=${userId}`);

    return Promise.resolve({
      userId,
      name: claims.name as string | undefined,
      email: (claims.email as string) || (claims.preferred_username as string) || undefined,
      preferred_username: claims.preferred_username as string | undefined,
      tenant_id: claims.tid as string | undefined,
    });
  }

  /**
   * Get display name for successful authentication.
   *
   * @param token - The stored token
   * @returns Display name string (e.g., " as user@domain.com")
   */
  protected override getSuccessDisplayName(token: StoredToken): string {
    const preferredUsername = token.metadata?.preferred_username as string | undefined;
    const email = token.metadata?.email as string | undefined;
    const username = preferredUsername || email || token.userId;
    return username ? ` as ${username}` : '';
  }

  /**
   * Get user-friendly error message based on Entra ID error code.
   *
   * @param errorCode - The error code from Entra ID or internal error
   * @param originalMessage - The original error message
   * @returns User-friendly error message
   * @see https://learn.microsoft.com/en-us/entra/identity-platform/reference-error-codes
   */
  protected override getOAuthErrorMessage(errorCode: string, originalMessage: string): string {
    const entraErrors: Record<string, string> = {
      AADSTS50076:
        'Multi-factor authentication required. Complete MFA in the browser and try again.',
      AADSTS50079:
        'Multi-factor authentication required. Complete MFA in the browser and try again.',
      AADSTS65001: 'Admin consent required for this application. Contact your IT administrator.',
      AADSTS70011: 'Invalid scope requested. Check ENTRA_SCOPES configuration.',
      AADSTS700016: 'Application not found. Check ENTRA_CLIENT_ID configuration.',
      AADSTS7000218: 'PKCE code_challenge is required. This is an application configuration error.',
      AADSTS50020: 'User account from an external identity provider is not allowed.',
      AADSTS530003: 'Conditional Access policy requires a compliant device.',
      interaction_required: 'Interactive login required. Please try authenticating again.',
      consent_required:
        'Admin consent required for this application. Contact your IT administrator.',
      invalid_grant:
        'The authorization code or refresh token has expired. Please authenticate again.',
    };

    return entraErrors[errorCode] || super.getOAuthErrorMessage(errorCode, originalMessage);
  }
}

// Singleton instance
let instance: EntraIdOAuthHandler | null = null;

/**
 * Create and cache the singleton Entra ID OAuth handler.
 *
 * This must be called with OIDC-discovered endpoints; it cannot be
 * constructed eagerly because endpoint resolution is async.
 *
 * @param entraConfig - Resolved Entra ID configuration
 * @param authorizeUrl - Authorization endpoint from OIDC discovery
 * @param tokenUrl - Token endpoint from OIDC discovery
 * @returns The singleton EntraIdOAuthHandler instance
 */
export function getEntraIdOAuthHandler(
  entraConfig: EntraIdConfig,
  authorizeUrl: string,
  tokenUrl: string,
): EntraIdOAuthHandler {
  if (!instance) {
    instance = new EntraIdOAuthHandler(entraConfig, authorizeUrl, tokenUrl);
  }
  return instance;
}

/**
 * Reset the singleton instance for testing purposes.
 *
 * @internal Should only be used in test files
 */
export async function resetEntraIdOAuthHandlerForTesting(): Promise<void> {
  if (instance) {
    await instance.stopServer();
  }
  instance = null;
}
