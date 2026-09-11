/**
 * GitHub OAuth Configuration.
 *
 * This module provides OAuth credentials for GitHub authentication.
 * Credentials are resolved in the following priority order:
 *
 * 1. Environment variables (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
 * 2. Embedded credentials (injected at build time for distributed binaries)
 *
 * For local development:
 * - Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables
 * - Or use the pre-built binary which has credentials embedded
 *
 * For distributed binaries:
 * - Credentials are embedded during CI/CD build from GitHub Actions secrets
 * - No user configuration required (zero-friction)
 *
 * Security model:
 * - Source code contains only placeholder strings (safe to commit)
 * - Actual credentials injected during release builds
 * - Environment variables can override embedded credentials if needed
 */

import { getOAuthConfig } from '../../../services/auth';
import {
  getEmbeddedCredentials,
  hasEmbeddedCredentials,
} from '../../../services/auth/embedded-credentials';

/**
 * Get OAuth configuration from environment variables or embedded credentials.
 *
 * @returns OAuth config with clientId, clientSecret, and isConfigured flag
 */
export function getGitHubOAuthConfig() {
  const hasEmbedded = hasEmbeddedCredentials('github');
  const embeddedCreds = hasEmbedded ? getEmbeddedCredentials('github') : undefined;

  return getOAuthConfig(
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    embeddedCreds ? () => embeddedCreds.clientId || '' : undefined,
    embeddedCreds ? () => embeddedCreds.clientSecret || '' : undefined,
  );
}

/**
 * Check if OAuth credentials are configured (from env vars or embedded).
 *
 * @returns True if credentials are available from any source
 */
export function isOAuthConfigured(): boolean {
  return getGitHubOAuthConfig().isConfigured;
}

/**
 * Default OAuth callback port for GitHub authentication.
 * This is the standard port used when GITHUB_OAUTH_PORT is not specified.
 */
const DEFAULT_OAUTH_PORT = '8766';

/**
 * Decimal radix for parseInt - ensures base-10 parsing.
 */
const PARSE_INT_RADIX = 10;

/**
 * OAuth callback port.
 * Can be overridden via GITHUB_OAUTH_PORT environment variable.
 * Note: If changed, the GitHub app redirect URL must also be updated.
 */
export const OAUTH_PORT = parseInt(
  process.env.GITHUB_OAUTH_PORT || DEFAULT_OAUTH_PORT,
  PARSE_INT_RADIX,
);

/**
 * OAuth callback redirect URI.
 */
export const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`;

/**
 * OAuth flow timeout in milliseconds.
 */
export const OAUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Required OAuth scopes for GitHub MCP tools.
 *
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
 */
export const GITHUB_OAUTH_SCOPES = [
  'repo', // Full control of private repositories
  'read:org', // Read org and team membership
  'read:user', // Read user profile data
  'user:email', // Access user email addresses
  'workflow', // Update GitHub Action workflows
  'project', // Full control of Projects V2 (read + write)
  'security_events', // Read/write code scanning and Dependabot alert endpoints
  // Five gist tools ship in this build and GitHub refuses gist writes without
  // this scope, so creating, updating or deleting a gist returned "Not Found" for
  // every OAuth user. Anyone who signed in before this was added has to
  // re-authorise, since scopes are fixed at authorisation time.
  'gist',
];

/** Standard error message for unconfigured OAuth - used across modules */
export const GITHUB_OAUTH_NOT_CONFIGURED_ERROR = 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET';
