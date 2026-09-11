/**
 * Type definitions for Entra ID SSO authentication.
 *
 * Defines Entra ID–specific data shapes. Token storage and OAuth flow types
 * are provided by the base auth infrastructure in src/services/auth/types.ts.
 */

/**
 * Entra ID configuration for OAuth requests and OIDC endpoint resolution.
 * Loaded once at module initialization; immutable for process lifetime.
 *
 * @property clientId - Entra ID App Registration client ID (UUID)
 * @property tenantId - Entra ID tenant ID (UUID)
 * @property platformUrl - Remote MCP platform base URL
 * @property callbackPort - Local OAuth callback server port
 * @property loginTimeoutMs - SSO login timeout in milliseconds
 * @property scopes - OAuth scopes to request
 */
export interface EntraIdConfig {
  clientId: string;
  clientSecret?: string;
  tenantId: string;
  platformUrl: string;
  callbackPort: number;
  loginTimeoutMs: number;
  scopes: string[];
}

/**
 * OIDC discovery response resolved from Entra ID.
 * Cached in memory for the process lifetime.
 *
 * @property authorization_endpoint - Entra ID authorization URL
 * @property token_endpoint - Entra ID token exchange URL
 * @property issuer - Token issuer identifier
 * @property jwks_uri - JSON Web Key Set URL (not used by client)
 */
export interface OidcConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
  jwks_uri: string;
}

/**
 * Configuration for a service-specific API key header.
 * Maps a service name to its header name and environment variable source.
 *
 * @property headerName - HTTP header name (e.g., 'x-splunk-token')
 * @property envVar - Environment variable containing the API key (e.g., 'SPLUNK_TOKEN')
 * @property valueTemplate - Optional template applied to the env var value before
 *   setting the header. Use `${value}` as the placeholder. Defaults to `${value}`
 *   (raw value). Example: `'Bearer ${value}'` produces `'Bearer abc123'` from
 *   env value `'abc123'`. Used by `createStaticBearerFetch` for external
 *   partner servers that need a `Bearer` prefix in the `Authorization` header.
 */
export interface ServiceAuthConfig {
  headerName: string;
  envVar: string;
  valueTemplate?: string;
}

/**
 * Error categories for authentication failures.
 * Used for structured error handling and user-facing messages.
 */
export type AuthErrorCategory =
  | 'no_token'
  | 'token_expired'
  | 'refresh_failed'
  | 'browser_failed'
  | 'callback_timeout'
  | 'callback_port_unavailable'
  | 'token_exchange_failed'
  | 'keychain_unavailable'
  | 'network_error'
  | 'misconfiguration';
