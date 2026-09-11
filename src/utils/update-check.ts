import chalk from 'chalk';
import { Octokit } from 'octokit';
import semver from 'semver';
import { getEmbeddedGenericSecret } from '../services/auth/embedded-credentials';
import { logDebug, logInfo, logWarn } from '../services/logger';
import { GH_API_URL } from '../tools/github';
import { getGitHubTokenManager } from '../tools/github/auth/token-manager';
import { getPlatformInfo } from './update-platform';

/**
 * Get auth token for GitHub API calls.
 * Uses embedded token if available, falls back to GITHUB_TOKEN env var.
 */
export const getAuthToken = (): string | null => {
  // Try embedded token first (no user config required)
  const embedded = getEmbeddedGenericSecret('RELEASES_TOKEN');
  if (embedded) {
    return embedded;
  }
  // Fall back to user's GitHub token
  return process.env.GITHUB_TOKEN || null;
};

/**
 * Get package version from package.json or environment
 */
export const getPackageVersion = (): string => {
  try {
    const pkg = require('../../package.json') as { version: string };
    return pkg.version;
  } catch {
    return process.env.APP_VERSION || '0.0.0';
  }
};

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  assetId?: number;
  owner?: string;
  repo?: string;
  /** Auth token that was used successfully (so download can reuse it) */
  authToken?: string;
  /** Error code if the check failed */
  error?: 'no_auth' | 'auth_failed' | 'api_error';
}

const REPO_INFO = {
  owner: 'quynhonsemiconductor',
  repo: 'mcp-tools',
};

/**
 * Fetch release info with a given auth token.
 * Extracted so it can be retried with a different token on auth failure.
 */
const fetchReleaseWithToken = async (
  auth: string,
  packageVersion: string,
): Promise<UpdateCheckResult> => {
  const octokit = new Octokit({
    auth,
    baseUrl: GH_API_URL,
  });

  const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({
    ...REPO_INFO,
  });

  const latestVersion = latestRelease.tag_name.replace(/^v/, '');
  const isPrerelease = !!semver.prerelease(latestVersion);

  if (isPrerelease) {
    return {
      hasUpdate: false,
      latestVersion: packageVersion,
      currentVersion: packageVersion,
      authToken: auth,
    };
  }

  const hasUpdate =
    semver.valid(latestVersion) && semver.valid(packageVersion)
      ? semver.gt(latestVersion, packageVersion)
      : latestVersion > packageVersion; // Fallback to string comparison

  const { binaryName } = getPlatformInfo();

  const asset = latestRelease.assets.find((asset) => asset.name === binaryName);

  return {
    hasUpdate,
    latestVersion,
    currentVersion: packageVersion,
    assetId: asset?.id,
    owner: REPO_INFO.owner,
    repo: REPO_INFO.repo,
    authToken: auth,
  };
};

/**
 * Extract a numeric `status` field from an unknown error value, if present.
 */
const getErrorStatus = (error: unknown): number | undefined => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

/**
 * Check if an error is an HTTP auth failure (401/403).
 */
const isAuthError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  return status === 401 || status === 403;
};

/**
 * Try to get an auth token from the GitHub OAuth token manager (env var + keyring only).
 * Skips interactive browser OAuth — the update path may run non-interactively
 * (e.g. from the installer or with --non-interactive).
 * Returns null if no stored token is available.
 */
const getOAuthToken = async (): Promise<string | null> => {
  try {
    const tokenManager = getGitHubTokenManager();
    return await tokenManager.getToken({ interactive: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logDebug('OAuth token lookup failed', { error: message });
    return null;
  }
};

/**
 * Check for updates using GitHub API.
 *
 * Token resolution order:
 * 1. Embedded RELEASES_TOKEN / GITHUB_TOKEN env var (fast, sync)
 * 2. If those fail with 401/403, fall back to GitHub OAuth token manager
 *    (checks env var and OS keyring only — no interactive browser OAuth)
 */
export const checkForUpdates = async (): Promise<UpdateCheckResult> => {
  const packageVersion = getPackageVersion();

  // Try the quick sync token first (embedded or env var)
  const quickToken = getAuthToken();

  if (quickToken) {
    try {
      return await fetchReleaseWithToken(quickToken, packageVersion);
    } catch (error) {
      if (!isAuthError(error)) {
        logDebug('Update check failed with non-auth error', { status: getErrorStatus(error) });
        return {
          hasUpdate: false,
          latestVersion: '0.0.0',
          currentVersion: packageVersion,
          error: 'api_error',
        };
      }
      logInfo('Primary token rejected (401/403), trying OAuth fallback');
    }
  }

  // Either no quick token, or it was rejected. Try GitHub OAuth.
  try {
    const oauthToken = await getOAuthToken();
    if (oauthToken) {
      return await fetchReleaseWithToken(oauthToken, packageVersion);
    }
  } catch (error) {
    if (isAuthError(error)) {
      return {
        hasUpdate: false,
        latestVersion: '0.0.0',
        currentVersion: packageVersion,
        error: 'auth_failed',
      };
    }
    return {
      hasUpdate: false,
      latestVersion: '0.0.0',
      currentVersion: packageVersion,
      error: 'api_error',
    };
  }

  // No token from any source
  logWarn('No valid auth token from any source', { hadQuickToken: !!quickToken });
  return {
    hasUpdate: false,
    latestVersion: '0.0.0',
    currentVersion: packageVersion,
    error: quickToken ? 'auth_failed' : 'no_auth',
  };
};

/**
 * Silently check for updates without showing errors or exiting
 * This is designed to be used as a background check from other commands
 * Returns null if any error occurs (including missing auth token)
 *
 * Note: This intentionally does NOT use the OAuth fallback from checkForUpdates().
 * Keyring access adds latency inappropriate for a background check that runs on every command.
 * When the embedded token expires, silent notifications stop — users must run `update` explicitly.
 */
export const silentCheckForUpdates = async (): Promise<UpdateCheckResult | null> => {
  const packageVersion = getPackageVersion();

  try {
    const auth = getAuthToken();
    if (!auth) {
      // Silently fail when no token is present
      return null;
    }

    const octokit = new Octokit({
      auth,
      baseUrl: GH_API_URL,
    });

    const { data: latestRelease } = await octokit.rest.repos.getLatestRelease({
      ...REPO_INFO,
    });

    const latestVersion = latestRelease.tag_name.replace(/^v/, '');
    const isPrerelease = !!semver.prerelease(latestVersion);

    if (isPrerelease) {
      return {
        hasUpdate: false,
        latestVersion: packageVersion,
        currentVersion: packageVersion,
      };
    }

    const hasUpdate =
      semver.valid(latestVersion) && semver.valid(packageVersion)
        ? semver.gt(latestVersion, packageVersion)
        : latestVersion > packageVersion; // Fallback to string comparison

    const { binaryName } = getPlatformInfo();

    const asset = latestRelease.assets.find((asset) => asset.name === binaryName);

    return {
      hasUpdate,
      latestVersion,
      currentVersion: packageVersion,
      assetId: asset?.id,
      owner: REPO_INFO.owner,
      repo: REPO_INFO.repo,
    };
  } catch {
    // Silently fail on any error
    return null;
  }
};

/**
 * Show a notification if an update is available without blocking the process
 * Designed to be called at the end of other commands
 */
export const notifyIfUpdateAvailable = async (): Promise<void> => {
  try {
    const result = await silentCheckForUpdates();

    if (result?.hasUpdate) {
      console.log(
        `\n🚀 ${chalk.bold('Update available:')} ${chalk.dim(result.currentVersion)} → ${chalk.bold(chalk.cyan(result.latestVersion))}`,
      );
      console.log(`   Run ${chalk.cyan('qnsc-mcp update')} to install the latest version.`);
    }
  } catch {
    // Silently ignore any errors
  }
};
