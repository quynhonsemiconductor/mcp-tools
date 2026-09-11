/**
 * CLI command to log out of a single remote MCP server.
 *
 * Clears the local per-server session token and opens the gateway's
 * OIDC-protected credential manager so the user can revoke the stored
 * credential. Mirrors the MCP tool `logout` (both call performRemoteLogout).
 */

import chalk from 'chalk';
import { displayHeader } from '../lib/display';
import { performRemoteLogout } from '../tools/platform-session/logout-tool';

/**
 * Exit codes for the logout command.
 */
export enum LogoutExitCode {
  /** Logout completed (local token cleared and/or credential manager opened) */
  SUCCESS = 0,
  /** Logout failed (unknown server) */
  FAILURE = 1,
}

/**
 * Log out of a single remote MCP server.
 *
 * @param server - Remote MCP server id (e.g. "aws-knowledge-mcp-server"), as listed
 *   by `qnsc-mcp list-remote-mcps`
 * @returns Exit code indicating success (0) or failure (1)
 */
export async function logout(server: string): Promise<LogoutExitCode> {
  displayHeader();

  const result = await performRemoteLogout(server);

  if (!result.ok) {
    console.log(chalk.red(`✗ ${result.message}`));
    return LogoutExitCode.FAILURE;
  }

  console.log(chalk.cyan(`🔓 Logging out of ${result.serverName} (${result.serverId})...`));

  if (result.clearedLocalToken) {
    console.log(chalk.green('✓ Cleared the local session token.'));
  } else if (result.localClearFailed) {
    console.log(
      chalk.yellow(
        '⚠ Could not remove the locally stored token (keyring locked or access denied); it may still be present.',
      ),
    );
  }

  if (result.credentialManagerUrl) {
    console.log(
      chalk.green(
        `🌐 ${result.browserOpened ? 'Opened' : 'Open'} the credential manager to revoke ${result.serverName}:`,
      ),
    );
    console.log(`   ${result.credentialManagerUrl}`);
    console.log(
      chalk.dim(
        '   Revoke the credential there to finish. Any active session keeps working until its access token expires.',
      ),
    );
  } else {
    console.log(chalk.yellow(`ℹ ${result.message}`));
  }

  return LogoutExitCode.SUCCESS;
}
