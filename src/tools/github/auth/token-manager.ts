/**
 * GitHub Token Manager.
 *
 * Handles token acquisition, refresh, and lifecycle management for GitHub.
 * Coordinates between environment variables, token store, and OAuth handler.
 */

import env from '../../../env';
import { TokenManager, TokenStore, type TokenManagerDependencies } from '../../../services/auth';
import { getGitHubOAuthHandler } from './oauth-handler';

/**
 * Service name for GitHub credential storage.
 */
const KEYRING_SERVICE = 'qnsc-mcp-github';

/**
 * GitHub token manager singleton.
 *
 * Manages the full token lifecycle including:
 * - Environment variable tokens (GITHUB_TOKEN - highest priority)
 * - Stored OAuth tokens with proactive refresh
 * - Auto-initiation of OAuth flow when needed
 */
export class GitHubTokenManager extends TokenManager {
  /**
   * Create a new GitHubTokenManager.
   *
   * @param deps - Optional dependencies for testing. Uses production singletons by default.
   */
  constructor(deps?: Partial<Omit<TokenManagerDependencies, 'providerName'>>) {
    const tokenStore = deps?.tokenStore ?? new TokenStore(KEYRING_SERVICE);
    const oauthHandler = deps?.oauthHandler ?? getGitHubOAuthHandler();
    const getEnvToken =
      deps?.getEnvToken ??
      (() => {
        const token = env.GITHUB_TOKEN?.trim();
        // Treat empty string as undefined to allow OAuth fallback
        return token || undefined;
      });

    super({
      tokenStore,
      oauthHandler,
      getEnvToken,
      providerName: 'GitHub',
    });
  }
}

// Singleton instance
let instance: GitHubTokenManager | null = null;

/**
 * Get the singleton GitHub token manager instance.
 */
export function getGitHubTokenManager(): GitHubTokenManager {
  if (!instance) {
    instance = new GitHubTokenManager();
  }
  return instance;
}

/**
 * Reset the singleton instance for testing purposes.
 * @internal Should only be used in test files
 */
export function resetTokenManagerForTesting(): void {
  instance = null;
}
