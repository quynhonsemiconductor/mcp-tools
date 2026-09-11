/**
 * GitHub OAuth handler for local OAuth flow.
 * Extends the generic OAuth handler with GitHub-specific logic.
 */

import { GH_API_URL } from '..';
import {
  OAuthError,
  OAuthHandler,
  type OAuthProviderConfig,
  type StoredToken,
} from '../../../services/auth';
import {
  getGitHubOAuthConfig,
  GITHUB_OAUTH_NOT_CONFIGURED_ERROR,
  GITHUB_OAUTH_SCOPES,
  OAUTH_PORT,
  OAUTH_TIMEOUT_MS,
  REDIRECT_URI,
} from './oauth-config';

// Re-export for backward compatibility
export { GITHUB_OAUTH_NOT_CONFIGURED_ERROR, OAUTH_PORT, REDIRECT_URI };

/**
 * Convert GitHub API URL to base URL for OAuth endpoints.
 * For GitHub.com: https://api.github.com -> https://github.com
 * For GHES: https://ghe.example.com/api/v3 -> https://ghe.example.com
 *
 * @param apiUrl - The GitHub API URL
 * @returns The base URL for OAuth endpoints
 */
function getBaseUrlFromApiUrl(apiUrl: string): string {
  // For GitHub.com, convert api.github.com to github.com
  if (apiUrl.includes('api.github.com')) {
    return 'https://github.com';
  }

  // For GHES, remove /api/v3 suffix to get base URL
  return apiUrl.replace(/\/api\/v3\/?$/, '');
}

/**
 * Get OAuth URLs based on the configured GitHub API URL.
 * Supports both GitHub.com and GitHub Enterprise Server (GHES).
 *
 * @returns Object with authorizeUrl, tokenUrl, and userApiUrl
 */
function getOAuthUrls(): { authorizeUrl: string; tokenUrl: string; userApiUrl: string } {
  const baseUrl = getBaseUrlFromApiUrl(GH_API_URL);

  return {
    authorizeUrl: `${baseUrl}/login/oauth/authorize`,
    tokenUrl: `${baseUrl}/login/oauth/access_token`,
    userApiUrl: `${GH_API_URL}/user`,
  };
}

/**
 * GitHub OAuth API response structure for oauth/access_token endpoint.
 *
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */
export interface GitHubOAuthAccessResponse {
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
 * GitHub OAuth handler for local OAuth flow.
 * Manages the OAuth 2.0 flow with PKCE support for secure authentication.
 */
export class GitHubOAuthHandler extends OAuthHandler {
  private readonly userApiUrl: string;

  /**
   * Create a new GitHubOAuthHandler.
   *
   * @param config - Optional OAuth configuration. If not provided, reads from environment.
   */
  constructor(config?: { clientId: string; clientSecret: string }) {
    const resolvedConfig = config ?? getGitHubOAuthConfig();
    const oauthUrls = getOAuthUrls();

    const providerConfig: OAuthProviderConfig = {
      providerName: 'GitHub',
      clientId: resolvedConfig.clientId,
      clientSecret: resolvedConfig.clientSecret,
      scopes: GITHUB_OAUTH_SCOPES,
      port: OAUTH_PORT,
      timeout: OAUTH_TIMEOUT_MS,
      authorizeUrl: oauthUrls.authorizeUrl,
      tokenUrl: oauthUrls.tokenUrl,
    };
    super(providerConfig);

    this.userApiUrl = oauthUrls.userApiUrl;
  }

  /**
   * Get user information from GitHub API.
   *
   * @param accessToken - The access token to use
   * @returns User information with userId, name, email, and avatar_url
   */
  protected async getUserInfo(accessToken: string): Promise<{
    userId: string;
    name?: string;
    email?: string;
    [key: string]: any;
  }> {
    const response = await fetch(this.userApiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new OAuthError(
        `Failed to get user info: ${response.statusText}`,
        undefined,
        'USER_INFO_FAILED',
      );
    }

    const data = (await response.json()) as {
      login: string;
      name?: string;
      email?: string;
      avatar_url?: string;
    };

    return {
      userId: data.login,
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url,
    };
  }

  /**
   * Get display name for successful authentication.
   *
   * @param token - The stored token
   * @returns Display name string (e.g., " as username")
   */
  protected getSuccessDisplayName(token: StoredToken): string {
    const username = token.userId;
    return username ? ` as @${username}` : '';
  }

  /**
   * Get user-friendly error message based on GitHub OAuth error code.
   *
   * @param errorCode - The error code from GitHub or internal error
   * @param originalMessage - The original error message for logging context
   * @returns User-friendly error message
   * @see https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/troubleshooting-authorization-request-errors
   */
  protected getOAuthErrorMessage(errorCode: string, originalMessage: string): string {
    // GitHub-specific OAuth error codes
    // @see https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/troubleshooting-authorization-request-errors
    const githubSpecificErrors: Record<string, string> = {
      bad_verification_code: 'The authorization code has expired. Please try authenticating again.',
      incorrect_client_credentials: 'OAuth configuration error. Please contact support.',
      redirect_uri_mismatch: 'OAuth configuration error. The redirect URL is misconfigured.',
      unverified_user_email: 'Please verify your email address with GitHub before continuing.',
    };

    // Return GitHub-specific error if we have one, otherwise delegate to parent
    return (
      githubSpecificErrors[errorCode] || super.getOAuthErrorMessage(errorCode, originalMessage)
    );
  }
}

// Singleton instance
let instance: GitHubOAuthHandler | null = null;

/**
 * Get the singleton OAuth handler.
 */
export function getGitHubOAuthHandler(): GitHubOAuthHandler {
  if (!instance) {
    instance = new GitHubOAuthHandler();
  }
  return instance;
}

/**
 * Reset the singleton instance for testing purposes.
 * @internal Should only be used in test files
 */
export async function resetOAuthHandlerForTesting(): Promise<void> {
  if (instance) {
    await instance.stopServer();
  }
  instance = null;
}
