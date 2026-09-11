/**
 * available-remote-servers.ts - Predefined list of approved remote MCP servers
 *
 * This module contains the approved remote MCP servers that users can select from.
 * System administrators control this list to ensure only approved and secure servers are available.
 */

import { OAuthClientInformationMixed } from '@modelcontextprotocol/sdk/shared/auth.js';
import { resolveHostByTier } from '../gateway/environment-tier';
import type { RemoteAuthType } from '../gateway/remote-mcp-client';
import { logInfo, logWarn } from '../services/logger';

/** New consolidated MCP platform gateway host by environment tier */
const QNSC_PLATFORM_HOSTS: Record<string, string> = {
  prod: 'mcp-prod.ai.qnsc.vn',
  'pre-prod': 'mcp-pp.ai.qnsc.vn',
  'non-prod': 'mcp-np.ai.qnsc.vn',
};

/**
 * Build a URL for a server hosted on the new consolidated MCP platform gateway.
 * URL pattern: `https://{gatewayDomain}/{name}/mcp`
 *
 * Supports an optional env-var override for local testing or incremental
 * per-server validation. The override env var name is derived by uppercasing
 * `name` and replacing hyphens with underscores, then appending `_MCP_URL`
 * (e.g. `aws-knowledge` → `AWS_KNOWLEDGE_MCP_URL`).
 *
 * Regression guard for #1300: entries routed here are platform-handled —
 * identity comes from platform OAuth and per-user credentials are injected
 * gateway-side. They must NOT set a client-side `authType` or `requiredEnvVars`;
 * a client-side authType (e.g. 'entra-id') is rejected with 401 by the
 * consolidated gateway. See available-remote-servers.test.ts for the guard that
 * enforces this across every platform-handled entry.
 */
export function getPlatformMcpUrl(name: string): string {
  const envVar = `${name.toUpperCase().replace(/-/g, '_')}_MCP_URL`;
  const host = resolveHostByTier(QNSC_PLATFORM_HOSTS);
  return getExternalMcpUrl(envVar, `https://${host}/${name}/mcp`);
}

/**
 * Build a URL for a vendor-hosted MCP server that is reached **directly**, without
 * the platform gateway.
 *
 * Counterpart to {@link getPlatformMcpUrl}. Some vendors publish a public,
 * fully-managed MCP endpoint that needs no brokered identity, so proxying it
 * through the gateway adds a dependency without adding anything: the entry stops
 * working whenever the gateway is unavailable, even though the vendor endpoint is
 * fine. Entries here therefore have no gateway dependency at all.
 *
 * `allowedHostSuffixes` is required rather than optional, unlike the underlying
 * {@link getExternalMcpUrl}. A direct entry names its vendor's domain in source,
 * so an env-var override that points somewhere else is a redirect off the vendor
 * and is rejected. Pinning it costs nothing and removes the failure mode.
 *
 * The override env var follows the same convention as the platform helper:
 * uppercase `name`, hyphens to underscores, `_MCP_URL` suffix
 * (e.g. `aws-knowledge` → `AWS_KNOWLEDGE_MCP_URL`).
 *
 * @param name - Server name used to derive the override env var.
 * @param defaultUrl - The vendor's published endpoint.
 * @param allowedHostSuffixes - Vendor domains an override may point at.
 */
export function getDirectMcpUrl(
  name: string,
  defaultUrl: string,
  allowedHostSuffixes: readonly string[],
): string {
  const envVar = `${name.toUpperCase().replace(/-/g, '_')}_MCP_URL`;
  return getExternalMcpUrl(envVar, defaultUrl, allowedHostSuffixes);
}

/**
 * Resolve a URL for an external (non-platform) MCP server, with optional env-var override.
 *
 * The override is validated to defend against env-var poisoning that would
 * redirect partner API keys (e.g. SMARTSHEET_API_KEY) to an attacker-controlled
 * host. Three checks apply:
 *
 *   1. The override must parse as a URL.
 *   2. The protocol must be https: (no plaintext token exposure).
 *   3. If `allowedHostSuffixes` is supplied, the hostname must exactly match
 *      one of the suffixes or end with `.<suffix>` (subdomain allowlist).
 *
 * On any validation failure the override is rejected and the default URL is
 * returned, with a warning log naming the env var.
 *
 * @param envVar - Name of the env var that can override the default URL.
 * @param defaultUrl - The fallback URL when the env var is unset or invalid.
 * @param allowedHostSuffixes - Optional suffix allowlist; omit to skip host check.
 */
export function getExternalMcpUrl(
  envVar: string,
  defaultUrl: string,
  allowedHostSuffixes?: readonly string[],
): string {
  const override = process.env[envVar];
  if (!override) {
    return defaultUrl;
  }

  let parsed: URL;
  try {
    parsed = new URL(override);
  } catch {
    logWarn(
      `[remote-mcps] ${envVar} override "${override}" is not a valid URL; falling back to default`,
    );
    return defaultUrl;
  }

  if (parsed.protocol !== 'https:') {
    logWarn(
      `[remote-mcps] ${envVar} override "${override}" must use https://; falling back to default`,
    );
    return defaultUrl;
  }

  if (allowedHostSuffixes && allowedHostSuffixes.length > 0) {
    const host = parsed.hostname;
    const allowed = allowedHostSuffixes.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
    if (!allowed) {
      logWarn(
        `[remote-mcps] ${envVar} override "${override}" host "${host}" is not in the allowed list ` +
          `[${allowedHostSuffixes.join(', ')}]; falling back to default`,
      );
      return defaultUrl;
    }
  }

  logInfo(`[remote-mcps] ${envVar} override active: ${override}`);
  return override;
}

export interface RemoteMCPServerDefinition {
  /** Unique identifier for the remote MCP server */
  id: string;
  /** Display name for the remote MCP server */
  name: string;
  /** Human-readable description of the server's purpose */
  description: string;
  /** HTTP streaming endpoint URL for the remote MCP server (must be HTTPS) */
  url: string;
  /** Required environment variables for authentication */
  requiredEnvVars?: string[];
  /** Optional parameters to send to the remote server */
  parameters?: Record<string, any>;
  /** Optional headers for authentication and configuration */
  headers?: Record<string, string>;
  /** Category for grouping servers */
  category: 'internal' | 'partner' | 'external' | 'development';
  /** Optional OAuth client information for authentication */
  oAuthClientInformation?: OAuthClientInformationMixed;
  /**
   * Auth type for this server.
   *
   * - 'static' (default): headers with env-var substitution
   * - 'static-bearer': per-request Authorization header from SERVICE_AUTH_MAP
   * - 'oauth': MCP SDK–managed OAuth 2.1 flow
   * - 'entra-id': Entra ID SSO via EntraIdTokenManager
   */
  authType?: RemoteAuthType;
}

/**
 * Approved remote MCP servers that users can select from
 *
 * To add a new server:
 * 1. Add the server definition to this array
 * 2. Update documentation with the new server details
 * 3. Test the server configuration thoroughly
 * 4. Update any relevant security policies
 *
 * These servers are hosted externally and accessed via HTTP endpoints.
 */
export const AVAILABLE_REMOTE_MCP_SERVERS: RemoteMCPServerDefinition[] = [
  {
    id: 'figma-dev',
    name: 'Figma Dev Mode MCP Server',
    description: 'Figma Dev Mode remote MCP server for accessing Figma design data',
    url: 'http://localhost:3845/mcp',
    category: 'development',
  },
  {
    id: 'aws-knowledge-mcp-server',
    name: 'AWS Knowledge MCP Server',
    description:
      "A remote, fully-managed MCP server hosted by AWS that provides access to the latest AWS docs, API references, What's New Posts, Getting Started information, Builder Center, Blog posts, Architectural references, and Well-Architected guidance.",
    // Reached directly: AWS publishes this endpoint publicly and it needs no
    // credentials, so it has no reason to depend on the platform gateway. It was
    // previously routed through getPlatformMcpUrl, which made it unreachable
    // wherever the gateway is not deployed even though the AWS endpoint answers.
    url: getDirectMcpUrl('aws-knowledge', 'https://knowledge-mcp.global.api.aws/mcp', ['api.aws']),
    category: 'external',
  },
];

/**
 * Get a remote MCP server definition by ID
 */
export function getRemoteMCPServer(id: string): RemoteMCPServerDefinition | undefined {
  return AVAILABLE_REMOTE_MCP_SERVERS.find((server) => server.id === id);
}

/**
 * Get all available remote MCP server IDs
 */
export function getAvailableRemoteMCPServerIds(): string[] {
  return AVAILABLE_REMOTE_MCP_SERVERS.map((server) => server.id);
}

/**
 * Get remote MCP servers by category
 */
export function getRemoteMCPServersByCategory(
  category: RemoteMCPServerDefinition['category'],
): RemoteMCPServerDefinition[] {
  return AVAILABLE_REMOTE_MCP_SERVERS.filter((server) => server.category === category);
}

/**
 * Validate that all provided remote server IDs are available
 */
export function validateRemoteMCPServerIds(serverIds: string[]): {
  valid: string[];
  invalid: string[];
} {
  const availableIds = getAvailableRemoteMCPServerIds();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const id of serverIds) {
    if (availableIds.includes(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }

  return { valid, invalid };
}
