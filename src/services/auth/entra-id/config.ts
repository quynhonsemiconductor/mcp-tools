/**
 * Entra ID configuration with bundled defaults and environment variable overrides.
 *
 * Ships with production defaults so users get a working setup out of the box (FR-021).
 * Entra ID client ID and client secret are embedded at build time from GitHub Secrets
 * via the EMBEDDED_CREDENTIAL_CONTEXT define (same mechanism as Slack/GitHub OAuth).
 * All values can be overridden via environment variables for development and testing.
 */

import { getEmbeddedCredentials } from '../embedded-credentials';
import type { EntraIdConfig, ServiceAuthConfig } from './types';

/**
 * Retrieve the Entra ID client ID from build-time embedded credentials.
 * Falls back to empty string when credentials are not embedded (dev builds).
 */
function getEmbeddedEntraClientId(): string {
  return getEmbeddedCredentials('entra').clientId ?? '';
}

/**
 * Retrieve the Entra ID client secret from build-time embedded credentials.
 * Falls back to undefined when credentials are not embedded (dev builds).
 */
function getEmbeddedEntraClientSecret(): string | undefined {
  return getEmbeddedCredentials('entra').clientSecret;
}

/**
 * Default Entra ID client ID for QNSC's App Registration ("QNSC MCP Tools").
 * This is a public identifier, not a secret — safe to hardcode.
 * Sourced from build-time embedded credentials first (CI can override via
 * ENTRA_CLIENT_ID secret); falls back to the literal QNSC App Registration ID
 * so local/dev builds work without needing the embed step.
 * Override with ENTRA_CLIENT_ID env var.
 */
const DEFAULT_CLIENT_ID = getEmbeddedEntraClientId() || 'ea7aaa9c-a73d-4ce5-85c9-4dea86e89c16';

/**
 * Default Entra ID tenant ID for QNSC's M365 tenant.
 * This is a public identifier, not a secret — safe to hardcode.
 * Override with ENTRA_TENANT_ID environment variable.
 */
const DEFAULT_TENANT_ID = 'dc0f2078-ac28-4ff2-b21a-d4b28df32361';

/**
 * Default remote MCP platform base URL.
 * Override with MCP_PLATFORM_URL environment variable.
 *
 * Currently empty because the centralized MCP platform gateway is not yet deployed.
 * While empty, `isRemotePlatformRequest()` in platform-auth.ts always returns false,
 * so callers must pass `skipUrlCheck: true` to attach auth headers. Once the platform
 * URL is set (via env var or updated default), the URL check will work automatically
 * and `skipUrlCheck` can be removed from callsites.
 */
const DEFAULT_PLATFORM_URL = '';

/**
 * Callback server ports to try in order.
 * If the primary port is occupied, the server falls back to alternatives.
 */
export const CALLBACK_PORTS = [9876, 9877, 9878, 9879] as const;

/**
 * Default local OAuth callback server port.
 * Override with MCP_AUTH_CALLBACK_PORT environment variable.
 */
const DEFAULT_CALLBACK_PORT: number = CALLBACK_PORTS[0];

/**
 * Default SSO login timeout in milliseconds (120 seconds).
 * Override with MCP_AUTH_LOGIN_TIMEOUT_MS environment variable.
 */
const DEFAULT_LOGIN_TIMEOUT_MS = 120_000;

/**
 * Build the default OAuth scopes for Entra ID.
 * Includes openid, profile, email, offline_access (for refresh tokens),
 * and the API scope for the MCP platform.
 *
 * @param clientId - The Entra ID App Registration client ID
 * @returns Array of OAuth scope strings
 */
function buildDefaultScopes(clientId: string): string[] {
  const scopes = ['openid', 'profile', 'email', 'offline_access'];
  if (clientId) {
    scopes.push(`${clientId}/.default`);
  }
  return scopes;
}

/**
 * Parse a space-delimited scope string from the ENTRA_SCOPES environment variable.
 * Returns null if the value is empty or undefined so the caller can fall back to defaults.
 *
 * @param raw - Raw environment variable value (may be undefined)
 * @returns Parsed scope array, or null when no override is provided
 */
function parseScopes(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const scopes = raw.trim().split(/\s+/).filter(Boolean);
  return scopes.length > 0 ? scopes : null;
}

/**
 * Load the Entra ID configuration from bundled defaults and environment variable overrides.
 * Values are resolved once and are immutable for the process lifetime.
 *
 * @returns Resolved Entra ID configuration
 */
export function loadEntraIdConfig(): EntraIdConfig {
  const clientId = process.env.ENTRA_CLIENT_ID || DEFAULT_CLIENT_ID;
  const clientSecret =
    process.env.ENTRA_CLIENT_SECRET || getEmbeddedEntraClientSecret() || undefined;
  const tenantId = process.env.ENTRA_TENANT_ID || DEFAULT_TENANT_ID;
  const platformUrl = process.env.MCP_PLATFORM_URL || DEFAULT_PLATFORM_URL;

  const callbackPort = parseInt(
    process.env.MCP_AUTH_CALLBACK_PORT || String(DEFAULT_CALLBACK_PORT),
    10,
  );

  const loginTimeoutMs = parseInt(
    process.env.MCP_AUTH_LOGIN_TIMEOUT_MS || String(DEFAULT_LOGIN_TIMEOUT_MS),
    10,
  );

  const scopes = parseScopes(process.env.ENTRA_SCOPES) ?? buildDefaultScopes(clientId);

  return {
    clientId,
    clientSecret,
    tenantId,
    platformUrl,
    callbackPort: Number.isNaN(callbackPort) ? DEFAULT_CALLBACK_PORT : callbackPort,
    loginTimeoutMs: Number.isNaN(loginTimeoutMs) ? DEFAULT_LOGIN_TIMEOUT_MS : loginTimeoutMs,
    scopes,
  };
}

/**
 * Map of service-specific API key configurations.
 * Each entry maps a service name to the header name and environment variable
 * that provides the API key for that service.
 *
 * Extensible per FR-017 — add new services by adding entries to this map.
 *
 * Note on `Authorization` header entries: when a service uses
 * `headerName: 'Authorization'`, it MUST also be consumed via a fetch wrapper
 * (like `createStaticBearerFetch`) that scopes the attachment to that service
 * only. Do not consume such entries via `attachAuthHeaders` without an explicit
 * `serviceId` filter — the broad `Authorization` header name could clobber
 * other services' auth headers.
 */
export const SERVICE_AUTH_MAP: Record<string, ServiceAuthConfig> = {
  // Intentionally empty. The only entry fronted a gateway-routed server that was
  // removed, and no remaining server declares authType 'static-bearer'. The
  // machinery is kept as the extension point for the next static-bearer service.
};
