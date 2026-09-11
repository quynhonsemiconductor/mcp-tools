/**
 * OAuth configuration utilities.
 *
 * Provides helpers for loading OAuth credentials from environment variables
 * and embedded credentials (injected at build time for distributed binaries).
 */

import type { OAuthConfig } from './types';

/**
 * Get OAuth configuration from environment variables or embedded credentials.
 *
 * @param envClientIdKey - Environment variable name for client ID
 * @param envClientSecretKey - Environment variable name for client secret
 * @param getEmbeddedClientId - Optional function to get embedded client ID
 * @param getEmbeddedClientSecret - Optional function to get embedded client secret
 * @returns OAuth config with clientId, clientSecret, and isConfigured flag
 */
export function getOAuthConfig(
  envClientIdKey: string,
  envClientSecretKey: string,
  getEmbeddedClientId?: () => string,
  getEmbeddedClientSecret?: () => string,
): OAuthConfig {
  // Priority: Environment variables > Embedded credentials
  const clientId =
    process.env[envClientIdKey] || (getEmbeddedClientId ? getEmbeddedClientId() : '');
  const clientSecret =
    process.env[envClientSecretKey] || (getEmbeddedClientSecret ? getEmbeddedClientSecret() : '');

  return {
    clientId,
    clientSecret,
    isConfigured: !!(clientId && clientSecret),
  };
}

/**
 * OAuth flow timeout in milliseconds (5 minutes).
 */
export const DEFAULT_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
