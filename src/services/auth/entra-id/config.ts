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
 * Delegated Microsoft Graph scopes requested at sign-in.
 *
 * Delegated, not application, permissions: the token acts as the person who signed
 * in, so they reach exactly the files and sites they already have and nothing else.
 * Application permissions would have meant one shared identity with tenant-wide
 * reach, a certificate on every laptop, and an audit trail naming the app instead
 * of the person.
 *
 * `offline_access` is what makes a refresh token available, so nobody has to sign
 * in again every hour.
 */
const GRAPH_DELEGATED_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Files.Read',
  'https://graph.microsoft.com/Sites.Read.All',
  // Outlook and Teams, read-only. Teams message APIs stopped being metered on
  // 2025-08-25, so these need no billing setup and work on the M365 Business
  // licences this tenant has. The protected-API restrictions that still apply to
  // chat messages are for application-only access, which this never uses.
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Chat.Read',
  'https://graph.microsoft.com/Calendars.Read',
  // Channel posts are team-wide rather than personal, so these need administrator
  // consent. They still read only what this user has joined — Graph scopes every
  // response to their membership.
  //
  // Three scopes are needed rather than one, which is not obvious: reading posts
  // requires ChannelMessage.Read.All, but the team and channel ids have to be
  // discovered first, and /me/joinedTeams and /teams/{id}/channels are governed
  // separately. Granting only the message scope fails at the first call.
  'https://graph.microsoft.com/Team.ReadBasic.All',
  'https://graph.microsoft.com/Channel.ReadBasic.All',
  'https://graph.microsoft.com/ChannelMessage.Read.All',
  // Directory lookup for colleagues. ReadBasic is the narrow form: name, email, job
  // title, department and phone, and nothing else. User.Read alone covers only the
  // signed-in person, so it cannot answer a question about anybody else.
  'https://graph.microsoft.com/User.ReadBasic.All',
  // The only write scopes here. Mail.Send sends as the signed-in person and cannot read
  // anything, and Calendars.ReadWrite replaces Calendars.Read rather than adding to it.
  // Recipients are restricted to the organisation by default, because this server also
  // reads content written by outsiders and an instruction embedded in it must not be
  // able to reach an outside address.
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.ReadWrite',
] as const;

/**
 * Build the default OAuth scopes for Entra ID.
 *
 * These used to be `${clientId}/.default` — the API scope of the previous owner's
 * MCP gateway, which is not deployed here, so a sign-in produced a token no service
 * would accept. They now target Microsoft Graph, which is a real audience.
 *
 * @param _clientId - Unused; kept so the signature stays stable for callers
 * @returns Array of OAuth scope strings
 */
function buildDefaultScopes(_clientId: string): string[] {
  return [...GRAPH_DELEGATED_SCOPES];
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
