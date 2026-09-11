import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import semver from 'semver';
import { downloadAndApplyUpdate, downloadAndApplyPRUpdate } from '../utils/update-utils';
import { logError as logErrorToFile } from '../services/logger';
import { getPackageVersion } from '../utils/update-check';
import {
  parsePRTarget,
  resolvePRArtifact,
  PRResolutionError,
  fetchReleaseByVersion,
  type PRArtifactInfo,
} from '../utils/update-pr-artifacts';
import { update } from './update';
import { EXIT_CODES, mapFailureToExitCode } from '../utils/exit-codes';

export { EXIT_CODES as INSTALL_EXIT_CODES };
export type InstallExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Main install command function.
 * - No target: installs latest (same as `update`)
 * - `v1.2.3` / `1.2.3`: installs specific version
 * - `pr<num>`: installs PR build
 */
export const install = async (argv: {
  target?: string;
  force?: boolean;
  nonInteractive?: boolean;
}) => {
  const { nonInteractive } = argv;

  const log = (message: string) => {
    if (!nonInteractive) console.log(message);
  };
  // Errors are diagnostics, not UI chrome — always write to stderr so
  // automated callers (scripts, installers) can see why an install failed,
  // even in --non-interactive mode. The nonInteractive flag only suppresses
  // progress/info output and interactive prompts.
  const logError = (message: string) => {
    console.error(message);
  };

  // Route based on target type
  if (argv.target) {
    const prNumber = parsePRTarget(argv.target);
    if (prNumber) {
      await installFromPR(prNumber, argv, log, logError);
      return;
    }

    // Try as version target. Use semver.valid's *normalized* return value —
    // not just as a boolean gate — so tolerated-but-messy inputs (e.g.
    // "vv1.2.3", "1.2.3+b1", " 1.2.3") resolve the correct "vX.Y.Z" tag
    // instead of forwarding the raw string and 404ing on a bogus tag.
    const normalizedVersion = semver.valid(argv.target.replace(/^v/, ''));
    if (!normalizedVersion) {
      logErrorToFile('Invalid install target', { target: argv.target });
      logError(`\n❌ ${chalk.red(`Invalid install target: "${argv.target}"`)}`);
      logError(chalk.dim('   Usage: qnsc-mcp install v1.2.3  or  qnsc-mcp install pr899'));
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }

    await installVersion(normalizedVersion, argv, log, logError);
    return;
  }

  // No target — install latest
  await installLatest(argv);
};

/**
 * Install latest stable release (delegates to update command).
 */
const installLatest = async (argv: {
  force?: boolean;
  nonInteractive?: boolean;
}): Promise<void> => {
  await update(argv);
};

/**
 * Install a specific version by semver (e.g. "1.2.3").
 */
const installVersion = async (
  version: string,
  argv: { force?: boolean; nonInteractive?: boolean },
  log: (message: string) => void,
  logError: (message: string) => void,
): Promise<void> => {
  const { nonInteractive } = argv;

  try {
    log(`🔍 ${chalk.cyan(`Fetching release v${version}...`)}`);

    const result = await fetchReleaseByVersion(version);

    if ('error' in result) {
      switch (result.error) {
        case 'no_auth':
          logErrorToFile('Authentication required for version install', { version });
          logError(`\n❌ ${chalk.red('Authentication required.')}`);
          logError(
            chalk.white.dim(
              'Set GITHUB_TOKEN or use a GitHub tool in Claude to trigger re-authentication.\n',
            ),
          );
          process.exit(EXIT_CODES.NO_AUTH_TOKEN);
        // eslint-disable-next-line no-fallthrough -- each case ends in process.exit(), which never returns
        case 'not_found':
          logErrorToFile('Version not found', { version });
          logError(
            `\n❌ ${chalk.red(`Version v${version} not found.`)} Check the version number and try again.`,
          );
          process.exit(EXIT_CODES.GENERAL_ERROR);
        // eslint-disable-next-line no-fallthrough -- each case ends in process.exit(), which never returns
        case 'forbidden':
          logErrorToFile('Forbidden fetching version', { version });
          logError(`\n❌ ${chalk.red('Access to the release was forbidden (HTTP 403).')}`);
          logError(
            chalk.white.dim(
              'This may be rate limiting, insufficient token scopes, or an org IP restriction — not necessarily a missing token. See the log file for details.\n',
            ),
          );
          process.exit(EXIT_CODES.NO_AUTH_TOKEN);
        // eslint-disable-next-line no-fallthrough -- each case ends in process.exit(), which never returns
        case 'no_platform_asset':
          logErrorToFile('No platform asset found for version', { version });
          logError(
            `\n❌ ${chalk.red('No download available for your platform')} in release v${version}.`,
          );
          process.exit(EXIT_CODES.NO_PLATFORM_ASSET);
        // eslint-disable-next-line no-fallthrough -- each case ends in process.exit(), which never returns
        default:
          logErrorToFile('Failed to fetch release by version', { version, error: result.error });
          logError(
            `\n❌ ${chalk.red('Failed to fetch release.')} Check your network connection and try again.`,
          );
          process.exit(EXIT_CODES.GENERAL_ERROR);
      }
    }

    const currentVersion = getPackageVersion();
    const comparable = semver.valid(currentVersion);
    const isSameVersion = comparable ? semver.eq(version, currentVersion) : false;
    const isDowngrade = comparable ? semver.lt(version, currentVersion) : false;
    const directionIcon = isSameVersion ? '🔁 ' : isDowngrade ? '⬇️ ' : '⬆️ ';
    const directionLabel = isSameVersion
      ? chalk.yellow('reinstalling current version')
      : `${isDowngrade ? chalk.yellow('downgrade') : chalk.cyan('upgrade')} from ${currentVersion}`;

    log(
      `\n${directionIcon} ${chalk.bold(`Installing v${version}`)} ${chalk.dim(`(${directionLabel})`)}`,
    );

    log('');
    const shouldProceed =
      argv.force ||
      nonInteractive ||
      (await confirm({
        message: `Install v${version}?`,
        default: true,
      }));

    if (!shouldProceed) {
      log(`\n${chalk.dim('Install canceled.')}`);
      return;
    }

    log(`\n🔄 ${chalk.bold('Downloading and installing...')}`);

    const applyResult = await downloadAndApplyUpdate({
      owner: result.owner,
      repo: result.repo,
      assetId: result.assetId,
      toVersion: version,
      nonInteractive,
      authToken: result.authToken,
    });

    if (applyResult.success) {
      log(`\n🎉 ${chalk.bold(chalk.cyan(`Successfully installed v${version}.`))}`);
      log(
        `\n📝 ${chalk.bold('To use the new version, please restart any apps running MCP servers:')}`,
      );
      log(
        chalk.dim(
          '   IDEs (VS Code, Visual Studio, Cursor, etc.), Claude Desktop, Claude Code, the MCP web server, or other MCP clients.',
        ),
      );
      process.exit(EXIT_CODES.SUCCESS);
    } else {
      logErrorToFile('Version install failed', {
        failureReason: applyResult.failureReason,
        version,
      });
      logError(
        `\n❌ ${chalk.red(`Install failed: ${applyResult.failureReason || 'unknown error'}.`)} You can try again or download manually from GitHub.`,
      );
      process.exit(mapFailureToExitCode(applyResult.failureReason));
    }
  } catch (error) {
    logErrorToFile('Unexpected error installing version', {
      error: error instanceof Error ? error.message : String(error),
      version,
    });
    // Honor this file's always-stderr contract (see logError above): the
    // unexpected-exception path under --non-interactive is exactly where an
    // installer/CI caller needs the reason, so never gate it on nonInteractive.
    logError(
      `\n❌ ${chalk.red('Error in install command:')} ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
};

/**
 * Handle installing from a PR artifact
 */
const installFromPR = async (
  prNumber: number,
  argv: { force?: boolean; nonInteractive?: boolean },
  log: (message: string) => void,
  logError: (message: string) => void,
): Promise<void> => {
  const { nonInteractive } = argv;

  try {
    log(`\n${chalk.yellow('⚠️  Pre-release build')} — Installing from PR #${prNumber}`);
    log(chalk.dim('   This is an unreviewed build from a pull request, not a stable release.\n'));

    log(`🔍 ${chalk.cyan(`Resolving PR #${prNumber} artifact...`)}`);

    const result = await resolvePRArtifact(prNumber);

    // Handle CI-in-progress case
    if ('ciInProgress' in result) {
      log(
        `\n⏳ ${chalk.yellow('CI is still building')} for the latest commit (${chalk.dim(result.latestSha.slice(0, 7))})`,
      );

      if (result.previousRun) {
        const prev = result.previousRun;

        // --force is the explicit opt-in to install the older build. Announce the
        // substitution on stderr (logError, not log) so it's visible even when
        // running non-interactively — the caller asked for PR #N's head but is
        // getting an earlier commit.
        if (argv.force) {
          logError(
            `\n⚠️  ${chalk.yellow(`CI is still building PR #${prNumber}; --force installing the previous build (${prev.headSha.slice(0, 7)}).`)}`,
          );
          return await installPRArtifact(prev, argv, log, logError);
        }

        // A plain --non-interactive run must not silently substitute a different
        // commit than requested. Signal CI_IN_PROGRESS (like the no-previous case)
        // so automated callers can decide; --force opts into the older build.
        if (nonInteractive) {
          logErrorToFile(
            'PR install deferred: CI in progress, previous build not auto-installed (non-interactive, no --force)',
            {
              prNumber,
              latestSha: result.latestSha,
              previousSha: prev.headSha,
            },
          );
          logError(
            `\n⏳ ${chalk.yellow(`CI is still building PR #${prNumber}.`)} A previous build (${prev.headSha.slice(0, 7)}) is available — re-run with ${chalk.bold('--force')} to install it, or wait for CI.`,
          );
          process.exit(EXIT_CODES.CI_IN_PROGRESS);
        }

        // Interactive: let the user choose.
        log(`   A previous build from commit ${chalk.dim(prev.headSha.slice(0, 7))} is available.`);
        const installPrevious = await confirm({
          message: 'Install the previous build?',
          default: true,
        });

        if (!installPrevious) {
          log(`\n${chalk.dim('Install canceled. Try again once CI completes.')}`);
          return;
        }

        return await installPRArtifact(prev, argv, log, logError);
      }

      // Nothing was installed — CI is still building and there's no prior
      // build to fall back to. Exit non-zero so automated callers don't read
      // a clean exit as "install succeeded".
      logErrorToFile('PR install unavailable: CI in progress, no previous build', {
        prNumber,
        latestSha: result.latestSha,
      });
      logError(
        `\n⏳ ${chalk.yellow('No installable build yet')} — CI is still building PR #${prNumber} and no previous build is available. Try again shortly.`,
      );
      process.exit(EXIT_CODES.CI_IN_PROGRESS);
    }

    // Ready to install
    return await installPRArtifact(result, argv, log, logError);
  } catch (error) {
    if (error instanceof PRResolutionError) {
      logErrorToFile('PR resolution failed', {
        code: error.code,
        message: error.message,
        prNumber,
      });
      if (error.code === 'no_auth') {
        logError(`\n❌ ${chalk.red('Authentication required.')}`);
        logError(chalk.dim(`   ${error.message}`));
        process.exit(EXIT_CODES.NO_AUTH_TOKEN);
      }
      logError(`\n❌ ${chalk.red(error.message)}`);
      process.exit(EXIT_CODES.GENERAL_ERROR);
    }

    logErrorToFile('Unexpected error installing from PR', {
      error: error instanceof Error ? error.message : String(error),
      prNumber,
    });
    // Always-stderr contract (see logError above) — automated callers need the
    // reason even in --non-interactive mode.
    logError(
      `\n❌ ${chalk.red('Error installing PR build:')} ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(EXIT_CODES.GENERAL_ERROR);
  }
};

/**
 * Install a resolved PR artifact.
 * Displays artifact details, prompts for confirmation (unless --force or --non-interactive),
 * downloads and applies the binary, and exits the process with the appropriate exit code.
 */
const installPRArtifact = async (
  artifactInfo: PRArtifactInfo,
  argv: { force?: boolean; nonInteractive?: boolean },
  log: (message: string) => void,
  logError: (message: string) => void,
): Promise<void> => {
  const { nonInteractive } = argv;

  log(`\n📦 ${chalk.bold('PR artifact found:')}`);
  log(`   Artifact: ${chalk.cyan(artifactInfo.artifactName)}`);
  log(`   Commit:   ${chalk.dim(artifactInfo.headSha.slice(0, 7))}`);

  if (artifactInfo.warning) {
    log(`\n${chalk.yellow(`⚠️  Warning: ${artifactInfo.warning}`)}`);
  }

  // Confirm installation
  log('');
  const shouldProceed =
    argv.force ||
    nonInteractive ||
    (await confirm({ message: 'Install this PR build?', default: true }));

  if (!shouldProceed) {
    log(`\n${chalk.dim('Install canceled.')}`);
    return;
  }

  log(`\n🔄 ${chalk.bold('Downloading and installing PR artifact...')}`);

  const result = await downloadAndApplyPRUpdate({ artifactInfo, nonInteractive });

  if (result.success) {
    log(
      `\n🎉 ${chalk.bold(chalk.cyan(`Successfully installed PR #${artifactInfo.prNumber} build (${artifactInfo.headSha.slice(0, 7)}).`))}`,
    );
    log(`\n📝 ${chalk.bold('You are now running a PR build.')}`);
    log(
      chalk.dim(`   Run ${chalk.cyan('qnsc-mcp update')} to go back to the latest stable release.`),
    );
    log(chalk.dim('   Please restart any apps running MCP servers to use the new version.'));
    process.exit(EXIT_CODES.SUCCESS);
  } else {
    const exitCode = mapFailureToExitCode(result.failureReason);
    logErrorToFile('PR install failed', {
      failureReason: result.failureReason,
      prNumber: artifactInfo.prNumber,
    });
    logError(
      `\n❌ ${chalk.red(`PR install failed: ${result.failureReason || 'unknown error'}.`)} You can try again or download manually from GitHub Actions.`,
    );
    process.exit(exitCode);
  }
};

export default install;
