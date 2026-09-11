/**
 * Platform authentication middleware (T020).
 *
 * Attaches dual-layer auth headers to remote MCP platform requests:
 * 1. JWT bearer token (`x-gateway-auth: Bearer <jwt>`) for API gateway validation (FR-015)
 * 2. The service's API key header (from SERVICE_AUTH_MAP) for downstream auth (FR-016)
 *
 * Service API key headers are only included when the corresponding environment variable
 * is set and non-empty. Empty or unset env vars cause the header to be omitted entirely
 * (never sent as an empty string) per security constraints in contracts/request-auth.yaml.
 *
 * @module
 */

import { logDebug, logInfo, logWarn } from '../../logger';
import { getEntraIdTokenManager } from '../entra-id';
import { loadEntraIdConfig, SERVICE_AUTH_MAP } from '../entra-id/config';

/** Cached Entra ID config — loaded once on first use. */
let cachedConfig: ReturnType<typeof loadEntraIdConfig> | null = null;

/**
 * Return the (lazily cached) Entra ID configuration.
 *
 * The config is read from env vars / defaults on first call and
 * reused for all subsequent calls within the process lifetime.
 *
 * @returns The resolved Entra ID configuration
 */
function getConfig(): ReturnType<typeof loadEntraIdConfig> {
  if (!cachedConfig) {
    cachedConfig = loadEntraIdConfig();
  }
  return cachedConfig;
}

/**
 * Reset the cached Entra ID config. Exposed for test isolation only.
 */
export function _resetConfigCache(): void {
  cachedConfig = null;
}

/**
 * Check if a request URL targets the remote MCP platform.
 *
 * Compares the request URL origin against the configured `platformUrl`.
 * Returns false for local tool calls and non-platform remote URLs.
 *
 * @param requestUrl - The URL to check
 * @returns true if the URL targets the remote MCP platform
 */
export function isRemotePlatformRequest(requestUrl: string): boolean {
  const config = getConfig();
  if (!config.platformUrl) {
    logDebug(
      'Platform URL not configured — isRemotePlatformRequest() returns false. Set MCP_PLATFORM_URL to enable URL-based auth gating.',
    );
    return false;
  }

  try {
    const reqUrl = new URL(requestUrl);
    const platformUrl = new URL(config.platformUrl);
    return reqUrl.origin === platformUrl.origin;
  } catch {
    return false;
  }
}

/**
 * Attach dual-layer authentication headers to a platform request.
 *
 * Headers attached:
 * 1. `x-gateway-auth: Bearer <jwt>` — for API gateway validation (FR-015)
 * 2. The service-specific API key header from SERVICE_AUTH_MAP[serviceId] — for
 *    downstream service auth, only when `options.serviceId` is provided (FR-016, FR-017)
 *
 * If `serviceId` is omitted, NO service-specific header is attached — only the
 * gateway JWT. This is by design: iterating SERVICE_AUTH_MAP without a serviceId
 * filter would risk attaching one service's headers (e.g. an
 * `Authorization: Bearer <key>`) to QNSC platform requests for other services.
 * Callers that need a service header MUST specify which service they're calling.
 *
 * If no valid token exists and `forceRefresh` is not set, this will trigger
 * the full browser-based SSO login flow (lazy authentication).
 *
 * @param requestUrl - The target request URL
 * @param options - Optional settings; `serviceId` selects which SERVICE_AUTH_MAP entry to attach
 * @returns Header record with auth credentials, or null if the URL is not a platform request
 */
export async function attachAuthHeaders(
  requestUrl: string,
  options?: {
    forceRefresh?: boolean;
    skipUrlCheck?: boolean;
    interactive?: boolean;
    serviceId?: string;
  },
): Promise<Record<string, string> | null> {
  if (!options?.skipUrlCheck && !isRemotePlatformRequest(requestUrl)) {
    logDebug(
      `Skipping auth headers: ${requestUrl} is not a platform request (platformUrl=${getConfig().platformUrl || '<empty>'})`,
    );
    return null;
  }

  const authStart = Date.now();
  const tokenManager = await getEntraIdTokenManager();
  const tokenOptions: { forceRefresh?: boolean; interactive?: boolean } = {};
  if (options?.forceRefresh) tokenOptions.forceRefresh = true;
  if (options?.interactive !== undefined) tokenOptions.interactive = options.interactive;
  const accessToken = await tokenManager.getToken(
    Object.keys(tokenOptions).length > 0 ? tokenOptions : undefined,
  );

  // Debug: decode JWT claims to help diagnose auth failures (never log token values)
  try {
    const parts = accessToken.split('.');
    if (parts.length === 3) {
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')) as {
        aud?: unknown;
        iss?: unknown;
        sub?: unknown;
        scp?: unknown;
        roles?: unknown;
        exp?: unknown;
      };
      logDebug(`JWT aud: ${String(claims.aud)}`);
      logDebug(`JWT iss: ${String(claims.iss)}`);
      logDebug(`JWT sub: ${String(claims.sub)}`);
      const scpOrRoles = claims.scp ?? claims.roles;
      const scpOrRolesStr = Array.isArray(scpOrRoles)
        ? scpOrRoles.join(',')
        : typeof scpOrRoles === 'string'
          ? scpOrRoles
          : 'none';
      logDebug(`JWT scp/roles: ${scpOrRolesStr}`);
      const expSeconds = typeof claims.exp === 'number' ? claims.exp : 0;
      logDebug(`JWT exp: ${new Date(expSeconds * 1000).toISOString()}`);
    }
  } catch {
    /* ignore decode errors */
  }

  const headers: Record<string, string> = {
    'x-gateway-auth': `Bearer ${accessToken}`,
  };

  // Attach the service-specific API key header for the requested service only.
  // This direct lookup (rather than iterating SERVICE_AUTH_MAP) prevents
  // accidental cross-service leak — attaching one service's API key header
  // to a request for a different service.
  if (options?.serviceId) {
    const serviceConfig = SERVICE_AUTH_MAP[options.serviceId];
    if (!serviceConfig) {
      logWarn(
        `serviceId "${options.serviceId}" not found in SERVICE_AUTH_MAP — no service API key header will be attached`,
      );
    } else {
      const apiKey = process.env[serviceConfig.envVar]?.trim();
      if (apiKey) {
        // Use the function form of String.prototype.replace to treat apiKey as
        // a literal — string-form replacement interprets $&, $', $`, and $$ as
        // special patterns, which would corrupt keys containing those sequences.
        const headerValue = serviceConfig.valueTemplate
          ? serviceConfig.valueTemplate.replace('${value}', () => apiKey)
          : apiKey;
        headers[serviceConfig.headerName] = headerValue;
        logDebug(`Attached ${options.serviceId} API key header: ${serviceConfig.headerName}`);
      } else {
        logDebug(`Skipping ${options.serviceId} API key header: ${serviceConfig.envVar} not set`);
      }
    }
  }

  logInfo(`Attached dual-layer auth headers for platform request (${Date.now() - authStart}ms)`);
  return headers;
}
