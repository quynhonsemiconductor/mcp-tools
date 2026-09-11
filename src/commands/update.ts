import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { checkForUpdates, downloadAndApplyUpdate } from '../utils/update-utils';
import { logError as logErrorToFile } from '../services/logger';
import { EXIT_CODES, mapFailureToExitCode } from '../utils/exit-codes';

/**
 * Exit codes for non-interactive mode. Shared with the install command via
 * utils/exit-codes.ts so both commands (and the installer's mirrored copy)
 * agree on what each code means. Re-exported here as UPDATE_EXIT_CODES for
 * backwards compatibility with existing callers.
 */
export const UPDATE_EXIT_CODES = EXIT_CODES;

export type UpdateExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Main update command function
 */
export const update = async (argv: {
  target?: string;
  checkOnly?: boolean;
  force?: boolean;
  nonInteractive?: boolean;
}) => {
  const { nonInteractive } = argv;

  // Helper to conditionally log (suppressed in non-interactive mode)
  const log = (message: string) => {
    if (!nonInteractive) {
      console.log(message);
    }
  };

  // Errors are diagnostics, not UI chrome — always write to stderr so automated
  // callers (the installer, CI, or `install` delegating here for a no-target run)
  // can see why an update failed, even in --non-interactive mode. Only progress/
  // info output (log) is suppressed when non-interactive.
  const logError = (message: string) => {
    console.error(message);
  };

  // `update` now installs the latest stable release only. Version and PR-build
  // installs live under `qnsc-mcp install`. Redirect any target here.
  if (argv.target) {
    if (/^pr\d+$/i.test(argv.target)) {
      logErrorToFile('Deprecated pr<num> target used with update command', { target: argv.target });
      // Via logError (always stderr) so a script running `update pr<num>
      // --non-interactive` sees why it exited non-zero, not just the exit code.
      logError(
        chalk.yellow(
          `\n⚠️  Deprecation warning: 'qnsc-mcp update ${argv.target}' is no longer supported.`,
        ),
      );
      logError(chalk.white(`   Use ${chalk.bold(`qnsc-mcp install ${argv.target}`)} instead.\n`));
    } else {
      logError(`\n❌ ${chalk.red(`Unknown update target: "${argv.target}"`)}`);
      logError(
        chalk.dim(
          `   Use ${chalk.bold(`qnsc-mcp install ${argv.target}`)} to install a specific version.`,
        ),
      );
    }
    process.exit(UPDATE_EXIT_CODES.GENERAL_ERROR);
  }

  try {
    log(`🔍 ${chalk.cyan('Checking for updates...')}`);

    const { hasUpdate, latestVersion, currentVersion, assetId, owner, repo, authToken, error } =
      await checkForUpdates();

    // Handle auth errors — no token at all, or token was rejected (expired/revoked)
    if (error === 'no_auth' || error === 'auth_failed') {
      logError(`\n❌ ${chalk.red('Unable to check for updates - authentication failed.')}`);
      logError(
        chalk.white.dim(
          error === 'auth_failed'
            ? 'Your authentication token may have expired. Use a GitHub tool in Claude to trigger re-authentication, or set the GITHUB_TOKEN environment variable.\n'
            : 'Set GITHUB_TOKEN or wait for a release with embedded credentials.\n',
        ),
      );
      process.exit(UPDATE_EXIT_CODES.NO_AUTH_TOKEN);
    }

    // Handle non-auth API errors (network issues, rate limiting, etc.)
    if (error === 'api_error') {
      logError(`\n❌ ${chalk.red('Unable to check for updates - API request failed.')}`);
      logError(
        chalk.white.dim(
          'This may be due to a network issue or GitHub API rate limiting. Please try again later.\n',
        ),
      );
      process.exit(UPDATE_EXIT_CODES.GENERAL_ERROR);
    }

    if (!hasUpdate) {
      log(
        `\n✅ ${chalk.bold('You are already running the latest version')} ${chalk.dim(`(${currentVersion})`)}`,
      );
      process.exit(UPDATE_EXIT_CODES.ALREADY_UP_TO_DATE);
    }

    log(
      `\n🚀 ${chalk.bold('Update available:')} ${chalk.dim(currentVersion)} → ${chalk.bold(chalk.cyan(latestVersion))}`,
    );

    if (!assetId || !owner || !repo) {
      logError(`\n❌ ${chalk.red('Could not find appropriate download for your platform.')}`);
      process.exit(UPDATE_EXIT_CODES.NO_PLATFORM_ASSET);
    }

    // Check if running with --check-only
    if (argv.checkOnly) {
      log(`\n💡 ${chalk.bold('Update is available.')} Run without --check-only to install.`);
      return;
    }

    // Ask for confirmation before proceeding with the update
    // Skip prompt if --force or --non-interactive
    log('');
    const shouldProceed =
      argv.force ||
      nonInteractive ||
      (await confirm({
        message: `Do you want to update?`,
        default: true,
      }));

    if (!shouldProceed) {
      log(`\n${chalk.dim('Update canceled.')}`);
      return;
    }

    log(`\n🔄 ${chalk.bold('Downloading and installing update...')}`);

    const result = await downloadAndApplyUpdate({
      owner,
      repo,
      assetId,
      toVersion: latestVersion,
      nonInteractive,
      authToken,
    });

    if (result.success) {
      log(`\n🎉 ${chalk.bold(chalk.cyan(`Successfully updated to version ${latestVersion}.`))}`);
      // Apps running MCP servers may still be using the old version until restarted
      log(
        `\n📝 ${chalk.bold('To use the new version, please restart any apps running MCP servers:')}`,
      );
      log(
        chalk.dim(
          '   IDEs (VS Code, Visual Studio, Cursor, etc.), Claude Desktop, Claude Code, the MCP web server, or other MCP clients.',
        ),
      );
      process.exit(UPDATE_EXIT_CODES.SUCCESS);
    } else {
      // Map failure reason to exit code
      const exitCode = mapFailureToExitCode(result.failureReason);
      logError(
        `\n❌ ${chalk.red('Update failed.')} You can try again or download manually from GitHub.`,
      );
      process.exit(exitCode);
    }
  } catch (error) {
    logError(
      `\n❌ ${chalk.red('Error in update command:')} ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(UPDATE_EXIT_CODES.GENERAL_ERROR);
  }
};

export default update;
