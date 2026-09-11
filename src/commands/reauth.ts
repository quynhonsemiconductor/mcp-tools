/**
 * CLI command for service re-authentication.
 *
 * Allows users to force re-authentication for a given service from the command
 * line. Routes to the correct auth provider based on the service name
 * (e.g. "Platform" → Entra ID SSO). Mirrors the MCP tool `reauth` (T026).
 */

import chalk from 'chalk';
import { displayHeader } from '../lib/display';
import {
  SERVICE_TO_PROVIDER,
  SUPPORTED_PROVIDERS,
  type AuthProvider,
  type ReauthenticateFn,
} from '../tools/platform-session/reauth-tool';

/**
 * Human-readable labels for each auth provider.
 */
const PROVIDER_LABELS: Record<AuthProvider, string> = {
  entra: 'Entra ID SSO',
};

/**
 * Exit codes for the reauth command.
 */
export enum ReauthExitCode {
  /** Re-authentication completed successfully */
  SUCCESS = 0,
  /** Re-authentication failed */
  FAILURE = 1,
}

/**
 * Force re-authentication for a named service.
 *
 * Resolves the service name to an auth provider and triggers a fresh login flow.
 * Currently only Entra ID (Platform) services are supported.
 *
 * @param service - Service name (case-insensitive), e.g. "Platform", "Entra"
 * @returns Exit code indicating success (0) or failure (1)
 */
export async function reauth(
  service: string,
  deps: { reauthenticate?: ReauthenticateFn } = {},
): Promise<ReauthExitCode> {
  displayHeader();

  const normalised = service.trim().toLowerCase();
  const provider = SERVICE_TO_PROVIDER[normalised];

  if (!provider) {
    const known = [...new Set(Object.keys(SERVICE_TO_PROVIDER))];
    console.log(
      chalk.red(`✗ Unknown service "${service}".`) + `\n  Known services: ${known.join(', ')}`,
    );
    return ReauthExitCode.FAILURE;
  }

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    console.log(
      chalk.yellow(
        `⚠ Re-authentication for "${service}" (${PROVIDER_LABELS[provider]}) is not yet supported.`,
      ) + '\n  Currently only Platform / Entra ID services are supported.',
    );
    return ReauthExitCode.FAILURE;
  }

  console.log(chalk.cyan(`🔐 Re-authenticating via ${PROVIDER_LABELS[provider]}...`));

  try {
    const startTime = Date.now();
    const token = await reauthProvider(provider, deps.reauthenticate);
    const elapsedMs = Date.now() - startTime;

    if (token) {
      console.log(
        chalk.green(
          `✓ Re-authentication successful via ${PROVIDER_LABELS[provider]} (${elapsedMs}ms)`,
        ),
      );
    } else {
      console.log(
        chalk.yellow(`⚠ Re-authentication completed but no token was returned (${elapsedMs}ms)`),
      );
    }

    return ReauthExitCode.SUCCESS;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`✗ Re-authentication failed: ${message}`));
    return ReauthExitCode.FAILURE;
  }
}

/**
 * Dispatch re-authentication to the appropriate provider.
 *
 * @param provider - The resolved auth provider key
 * @returns The new access token
 */
async function reauthProvider(
  provider: AuthProvider,
  injectedReauth?: ReauthenticateFn,
): Promise<string> {
  switch (provider) {
    case 'entra': {
      if (injectedReauth) {
        return injectedReauth();
      }
      const { reauthenticate } = await import('../services/auth/entra-id');
      return reauthenticate();
    }
    // Future providers:
    default:
      throw new Error(`No re-authentication handler for provider "${provider}"`);
  }
}
