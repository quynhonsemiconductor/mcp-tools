import type { Octokit } from 'octokit';
import { GH_API_URL } from '.';
import { logDebug, logWarn } from '../../services/logger';
import { warnOnce } from '../../utils/utils';
import { ToolConfig, ToolHandler } from '../registry';
import { isOAuthConfigured } from './auth/oauth-config';
import { getGitHubTokenManager } from './auth/token-manager';

/**
 * Get the Octokit class, loading it lazily on first use.
 * Uses require() for synchronous loading to preserve the sync getClient() API.
 * Note: We don't cache at module level to allow test mocks to work correctly.
 */
function getOctokitClass(): typeof Octokit {
  const mod = require('octokit') as { Octokit: typeof Octokit };
  return mod.Octokit;
}

/**
 * Minimal shape of the request parameters passed to Octokit's auth hook.
 * Only `headers` is read/mutated here; other Octokit route options may be
 * present but are irrelevant to token injection.
 */
interface OctokitRequestParameters {
  headers?: Record<string, string>;
  [option: string]: unknown;
}

/**
 * The `request` function Octokit hands to an auth strategy hook. It accepts a
 * route string and the (mutated) parameters, and resolves to the API response.
 */
type OctokitRequestFn = (
  route: string,
  parameters: OctokitRequestParameters,
) => Promise<unknown>;

/**
 * Minimal shape of an Octokit/HTTP error: only the HTTP `status` is inspected
 * to decide whether to attempt a token refresh.
 */
interface HttpStatusError {
  status?: number;
}

function hasHttpStatus(error: unknown): error is HttpStatusError {
  return typeof error === 'object' && error !== null && 'status' in error;
}

/**
 * Minimal shape of the GitHub API response fields this base reads: the payload
 * `data` and the pagination `headers.link`. Kept intentionally narrow so it
 * stays compatible with the full Octokit response type without depending on it.
 */
interface GitHubApiResponse {
  data?: unknown;
  headers?: {
    link?: string;
  };
}

/**
 * Abstract base class for GitHub-related tools that implements the ToolHandler interface.
 * Provides common functionality for GitHub API interactions with OAuth support.
 */
export abstract class GithubBaseTool implements ToolHandler {
  /**
   * Check if GitHub tools are enabled.
   * Tools are enabled if authentication is available via:
   * 1. GITHUB_TOKEN environment variable
   * 2. OAuth configuration (will trigger auth flow on first use)
   */
  isEnabled(_config: ToolConfig): boolean {
    // Check for environment token first (highest priority)
    const hasEnvToken = !!process.env.GITHUB_TOKEN;
    if (hasEnvToken) {
      return true;
    }

    // Check if OAuth is configured (client ID/secret available)
    const hasOAuthConfig = isOAuthConfigured();

    // Tools are enabled if OAuth is configured (will auto-trigger on first use)
    const isEnabled = hasOAuthConfig;

    // Only warn once if no authentication method is available
    if (!isEnabled) {
      warnOnce(
        'github-missing-token',
        'GitHub authentication not configured. GitHub tools will be disabled.\n' +
          'To enable: Set GITHUB_TOKEN environment variable or configure OAuth credentials.',
      );
    }

    return isEnabled;
  }

  /**
   * Cached token manager instance for lazy OAuth initialization.
   */
  private tokenManager = getGitHubTokenManager();

  /**
   * Cached Octokit client instance.
   */
  private cachedClient: Octokit | null = null;

  /**
   * Creates and returns an authenticated Octokit client for GitHub API interactions.
   *
   * Token resolution:
   * 1. GITHUB_TOKEN environment variable (immediate, highest priority)
   * 2. Stored OAuth token from keyring (immediate if available)
   * 3. OAuth flow initiation (async, triggered on first tool use if needed)
   *
   * The client is created with a hook that fetches the token on each request,
   * allowing OAuth flow to be triggered lazily and supporting token refresh.
   *
   * @returns An authenticated Octokit client instance
   * @throws Error if token acquisition fails (including OAuth flow failures)
   */
  protected getClient(): Octokit {
    if (this.cachedClient) {
      return this.cachedClient;
    }

    logDebug('Creating Octokit client with GitHub token manager');

    const Octokit = getOctokitClass();
    this.cachedClient = new Octokit({
      baseUrl: GH_API_URL,
      authStrategy: () => {
        return {
          // Hook is called before each request
          hook: async (
            request: OctokitRequestFn,
            route: string,
            parameters: OctokitRequestParameters,
          ) => {
            try {
              const token = await this.tokenManager.getToken();
              parameters.headers = {
                ...parameters.headers,
                authorization: `token ${token}`,
              };

              // Make the request
              return await request(route, parameters);
            } catch (error: unknown) {
              // Check if this is an authentication error (401/403)
              // This handles cases where token was revoked or invalidated outside normal expiration
              const status = hasHttpStatus(error) ? error.status : undefined;
              if (status === 401 || status === 403) {
                logWarn(
                  `GitHub returned ${status}, token may be invalid. Attempting refresh...`,
                );

                try {
                  // Force refresh to clear stored token and initiate new OAuth flow
                  const newToken = await this.tokenManager.getToken(true);
                  parameters.headers = {
                    ...parameters.headers,
                    authorization: `token ${newToken}`,
                  };

                  // Retry the request with new token
                  return await request(route, parameters);
                } catch (refreshError) {
                  throw new Error(
                    `GitHub authentication failed after refresh: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`,
                  );
                }
              }

              // Non-auth errors — re-throw as-is to preserve status code and message for callers
              throw error;
            }
          },
        };
      },
    });

    return this.cachedClient;
  }

  /**
   * Removes URL-containing properties from GitHub API responses and extracts only the data object.
   * Recursively processes nested objects and arrays to remove URL-related properties.
   *
   * @param response - The full GitHub API response
   * @param pagination - Flag to indicate if pagination is supported
   * @returns Cleaned response as a JSON string
   */
  cleanResponse(response: unknown, pagination: boolean = false): string {
    const typedResponse =
      typeof response === 'object' && response !== null
        ? (response as GitHubApiResponse)
        : undefined;

    if (!typedResponse?.data) {
      return JSON.stringify(response);
    }

    // Extract pagination data from headers if available
    let result: unknown = this.removeUrlProperties(typedResponse.data);

    // Check if headers exist and contain Link header for pagination
    const linkHeader = typedResponse.headers?.link;
    const hasHeaderLinks = !!linkHeader;
    if (hasHeaderLinks || pagination) {
      const paginated: {
        data: unknown;
        pagination: {
          current: number;
          hasPrevious: boolean;
          hasNext: boolean;
          totalPages: number | null;
        };
      } = {
        data: result,
        pagination: {
          current: 1,
          hasPrevious: false,
          hasNext: false,
          totalPages: 1,
        },
      };

      if (linkHeader) {
        const links = this.parseLinkHeader(linkHeader);
        if (Object.keys(links).length > 0) {
          const current = this.extractPageNumber(links.self || links.next || '') - 1;
          const totalPages = links.last ? this.extractPageNumber(links.last) : null;

          paginated.pagination = {
            current,
            hasPrevious: !!links.prev,
            hasNext: !!links.next,
            totalPages,
          };
        }
      }

      result = paginated;
    }

    return JSON.stringify(result);
  }

  /**
   * Parses GitHub Link header into an object with pagination links
   *
   * @param linkHeader - Link header string from GitHub API
   * @returns Object with pagination links (prev, next, first, last, self)
   */
  private parseLinkHeader(linkHeader: string): Record<string, string> {
    if (!linkHeader) return {};

    const links: Record<string, string> = {};
    const parts = linkHeader.split(',');

    for (const part of parts) {
      const match = part.match(/<(.+?)>;\s*rel="(.+?)"/);
      if (match) {
        const url = match[1];
        const rel = match[2];
        links[rel] = url;
      }
    }

    return links;
  }

  /**
   * Extracts page number from a URL
   *
   * @param url - URL containing page parameter
   * @returns Current page number or 1 if not found
   */
  private extractPageNumber(url: string): number {
    if (!url) return 1;

    const match = url.match(/[?&]page=(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  }

  /**
   * Recursively removes properties with keys that contain "url" from an object,
   * while retaining properties whose key is exactly "url" or "html_url" so that
   * primary resource links remain available in the response.
   *
   * @param obj - Object to clean
   * @returns Cleaned object with verbose URL properties removed
   */
  private removeUrlProperties(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeUrlProperties(item));
    }

    const newObj: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip properties with "url" in the key, but keep exact "url" and "html_url"
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('url') && lowerKey !== 'url' && lowerKey !== 'html_url') {
        continue;
      }

      // Recursively process nested objects/arrays
      newObj[key] = this.removeUrlProperties(value);
    }

    return newObj;
  }

  /**
   * Executes the tool's specific functionality.
   * Must be implemented by derived classes.
   *
   * @param args - Arguments required for the tool execution
   * @returns A promise that resolves to a string result
   */
  abstract execute(args: unknown): Promise<string>;
}
