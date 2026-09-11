/**
 * OIDC discovery for Entra ID tenant endpoints.
 *
 * Fetches the OpenID Connect discovery document from the well-known endpoint
 * and caches the result for the process lifetime. Endpoint URLs do not change
 * during a session so a single fetch is sufficient.
 */

import { logDebug, logError, logInfo } from '../../logger';
import type { OidcConfig } from './types';

/**
 * Cached OIDC discovery response. Cached for the process lifetime since
 * endpoint URLs don't change during a session.
 */
let cachedOidcConfig: OidcConfig | null = null;

/** Timeout for the OIDC discovery fetch in milliseconds. */
const OIDC_DISCOVERY_TIMEOUT_MS = 10_000;

/**
 * Discover OIDC endpoints from the Entra ID well-known configuration endpoint.
 *
 * Fetches the OpenID Connect discovery document and extracts the authorization,
 * token, issuer, and JWKS URIs. Results are cached in memory for the process
 * lifetime — subsequent calls return the cached response.
 *
 * @param tenantId - The Entra ID tenant ID
 * @returns The resolved OIDC configuration
 * @throws Error if the discovery endpoint is unreachable or returns invalid data
 */
export async function discoverOidcEndpoints(tenantId: string): Promise<OidcConfig> {
  if (cachedOidcConfig) {
    logDebug('Using cached OIDC discovery response');
    return cachedOidcConfig;
  }

  const discoveryUrl = `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`;
  logDebug(`Fetching OIDC discovery from ${discoveryUrl}`);

  let response: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OIDC_DISCOVERY_TIMEOUT_MS);
    try {
      response = await fetch(discoveryUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`OIDC discovery ${isTimeout ? 'timed out' : 'network error'}: ${errorMessage}`);
    throw new Error(
      isTimeout
        ? `OIDC discovery timed out after ${OIDC_DISCOVERY_TIMEOUT_MS / 1000}s. Check your network connection.`
        : 'Cannot reach authentication service. Check your network connection.',
    );
  }

  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed with status ${response.status}. ` +
        'Authentication configuration error — contact your administrator.',
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error(
      'Invalid OIDC discovery response. Authentication configuration error — contact your administrator.',
    );
  }

  const oidcConfig: OidcConfig = {
    authorization_endpoint: data.authorization_endpoint as string,
    token_endpoint: data.token_endpoint as string,
    issuer: data.issuer as string,
    jwks_uri: data.jwks_uri as string,
  };

  if (!oidcConfig.authorization_endpoint || !oidcConfig.token_endpoint) {
    throw new Error(
      'OIDC discovery returned incomplete endpoints. Authentication configuration error — contact your administrator.',
    );
  }

  // Guard against non-HTTPS endpoints — tokens must only be sent over TLS
  for (const [name, url] of Object.entries(oidcConfig)) {
    if (typeof url === 'string' && url && !url.startsWith('https://')) {
      throw new Error(
        `OIDC endpoint ${name} is not HTTPS (${url}). Refusing to proceed — possible MITM attack.`,
      );
    }
  }

  cachedOidcConfig = oidcConfig;
  logInfo('OIDC discovery complete');
  return oidcConfig;
}

/**
 * Reset the cached OIDC discovery response.
 *
 * @internal Should only be used in test files
 */
export function resetOidcCacheForTesting(): void {
  cachedOidcConfig = null;
}
