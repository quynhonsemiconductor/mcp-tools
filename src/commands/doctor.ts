import chalk from 'chalk';
import { displayHeader, writeJsonOutput } from '../lib/display';
import { DOCUMENTATION_URLS, SUPPORT } from '../lib/guidance-links';
import type { ValidationIssue } from '../services/validation';
import {
  formatIssueMessage,
  getRecommendations,
  getSearchedPaths,
  groupBySource,
  runDiagnostics,
} from '../services/validation';

/**
 * Options for the doctor command
 */
export interface DoctorOptions {
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Exit codes for the doctor command
 */
export enum DoctorExitCode {
  /** All validations passed */
  SUCCESS = 0,
  /** Validation errors found */
  VALIDATION_ERROR = 1,
}

/**
 * Doctor command to diagnose MCP configuration issues.
 *
 * This command validates MCP configuration files for common issues including:
 * - Syntax errors in JSON configuration
 * - Duplicate executables across servers
 * - Missing or placeholder environment variables
 * - Hardcoded secrets
 * - Invalid file paths for executables and arguments
 * - Invalid tool/category references in QNSC-MCP config
 *
 * @param configPath - Optional path to configuration file. If not provided, will search and validate ALL found configs.
 * @param options - Command options
 * @param options.json - Output results as JSON instead of human-readable format
 * @param options.verbose - Show all checks performed, even passing ones
 * @param options.quiet - Only show errors (suppresses warnings and success messages, useful for CI/CD)
 * @returns Exit code indicating success (0) or validation errors (1)
 *
 * @example
 * // Validate all found MCP configs
 * await doctor();
 *
 * @example
 * // Validate a specific config file
 * await doctor('/path/to/mcp.json');
 *
 * @example
 * // Get JSON output for programmatic processing
 * await doctor(undefined, { json: true });
 *
 * @example
 * // Verbose mode showing all checks
 * await doctor(undefined, { verbose: true });
 *
 * @example
 * // Quiet mode for CI/CD (only errors, silent on success)
 * const exitCode = await doctor(undefined, { quiet: true });
 * process.exit(exitCode);
 */
export async function doctor(
  configPath?: string,
  options?: DoctorOptions,
): Promise<DoctorExitCode> {
  const outputJson = options?.json ?? false;
  const verbose = options?.verbose ?? false;
  const quiet = options?.quiet ?? false;

  // In quiet mode, only show errors (no headers, warnings, or success messages)
  // Skip header and introductory text in JSON or quiet mode
  if (!outputJson && !quiet) {
    displayHeader();
    console.log('🩺 Running diagnostics...\n');
    console.log(
      chalk.dim(
        'Note: This validates common MCP config patterns. Each client (VS Code, Claude Desktop, etc.)',
      ),
    );
    console.log(
      chalk.dim('may support additional fields not checked here. Unknown fields are allowed.\n'),
    );
  }

  // Run diagnostics using shared logic
  const { mcpResults, qnscMcpResult, aggregated } = await runDiagnostics({ configPath, verbose });

  // Calculate total configs (MCP + QNSC-MCP)
  const hasQnscMcpConfig = !!qnscMcpResult.configPath;
  const totalConfigs = mcpResults.length + (hasQnscMcpConfig ? 1 : 0);

  // Handle no MCP client configs found
  if (mcpResults.length === 0 && !configPath) {
    if (hasQnscMcpConfig) {
      // QNSC-MCP config exists but no MCP client configs — guide the user
      if (outputJson) {
        await writeJsonOutput({
          valid: false,
          configs: [],
          qnscMcpConfig: {
            valid: qnscMcpResult.valid,
            issues: qnscMcpResult.issues,
            path: qnscMcpResult.configPath,
          },
          issues: [
            {
              severity: 'error',
              code: 'FILE_NOT_FOUND',
              message: 'No MCP client configuration file found',
              details: `QNSC-MCP config found at ${qnscMcpResult.configPath}, but no MCP client config (e.g., mcp.json, claude_desktop_config.json) was found. Your AI client needs a client config to know which MCP servers to run.`,
            },
          ],
        });
        return DoctorExitCode.VALIDATION_ERROR;
      }

      console.log(chalk.yellow('⚠️  No MCP client configuration file found'));
      console.log(`\n  QNSC-MCP config found: ${chalk.cyan(qnscMcpResult.configPath!)}`);
      if (qnscMcpResult.issues.length > 0) {
        console.log(
          chalk.yellow(
            `\n  Additionally, your QNSC-MCP config has ${qnscMcpResult.issues.length} issue(s):`,
          ),
        );
        qnscMcpResult.issues.forEach((issue) => {
          const icon = issue.severity === 'error' ? chalk.red('    ✗') : chalk.yellow('    ⚠');
          console.log(`${icon} ${issue.message}`);
          if (issue.details) {
            console.log(chalk.dim(`      ${issue.details}`));
          }
        });
      }
      console.log(
        chalk.dim('\n  However, your AI client (VS Code, Claude Desktop, etc.) also needs its own'),
      );
      console.log(chalk.dim('  MCP client config file to know which servers to run.'));
      console.log('\nSearched for client configs in:');
      const platformPaths = getSearchedPaths();
      platformPaths.forEach(({ path, description }) => {
        console.log(`  • ${description}: ${path}`);
      });
      console.log(
        chalk.cyan(
          '\n💡 Tip: Run "qnsc-mcp generate-config" to create a client config for your IDE.',
        ),
      );
      return DoctorExitCode.VALIDATION_ERROR;
    }

    if (outputJson) {
      await writeJsonOutput({
        valid: false,
        configs: [],
        issues: [
          {
            severity: 'error',
            code: 'FILE_NOT_FOUND',
            message: 'No MCP configuration file found',
            details: 'Searched in common locations but no config file was found',
          },
        ],
      });
      return DoctorExitCode.VALIDATION_ERROR;
    }

    console.log(chalk.red('❌ Error: No MCP configuration file found'));
    console.log('\nSearched in the following locations:');
    const platformPaths = getSearchedPaths();
    platformPaths.forEach(({ path, description }) => {
      console.log(`  • ${description}: ${path}`);
    });
    console.log('\n💡 Tip: Specify a custom path with --path <config-path>');
    return DoctorExitCode.VALIDATION_ERROR;
  }

  // Display found configs (validation already completed via runDiagnostics)
  if (!outputJson && !quiet && totalConfigs > 0) {
    console.log(chalk.bold(`Found and validated ${totalConfigs} configuration file(s):\n`));

    // Display MCP configs
    mcpResults.forEach(({ configInfo }) => {
      console.log(`  • ${chalk.cyan(configInfo.clientName)}: ${configInfo.path}`);
    });

    // Display QNSC-MCP config if found
    if (hasQnscMcpConfig) {
      console.log(`  • ${chalk.cyan('QNSC-MCP Config')}: ${qnscMcpResult.configPath}`);
    }

    console.log();
  }

  // Handle JSON output mode
  if (outputJson) {
    const errors = aggregated.allIssues.filter((i) => i.severity === 'error');
    const warnings = aggregated.allIssues.filter((i) => i.severity === 'warning');

    const jsonOutput = {
      valid: aggregated.overallValid,
      configs: mcpResults.map(({ configInfo, result }) => ({
        path: configInfo.path,
        client: configInfo.client,
        clientName: configInfo.clientName,
        valid: result.valid,
        serverCount: result.serverCount,
        issues: result.issues,
      })),
      qnscMcpConfig: {
        valid: qnscMcpResult.valid,
        issues: qnscMcpResult.issues,
        ...(hasQnscMcpConfig && { path: qnscMcpResult.configPath }),
      },
      summary: {
        totalConfigs,
        totalServerCount: aggregated.totalServerCount,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
      ...(verbose && { checksPerformed: aggregated.allChecksPerformed }),
    };
    await writeJsonOutput(jsonOutput);
    return aggregated.overallValid ? DoctorExitCode.SUCCESS : DoctorExitCode.VALIDATION_ERROR;
  }

  // Display verbose output (checks performed)
  if (verbose && !quiet && aggregated.allChecksPerformed.length > 0) {
    console.log(chalk.bold('Checks performed:'));
    aggregated.allChecksPerformed.forEach((check) => {
      console.log(chalk.dim(`  ✓ ${check}`));
    });
    console.log();
  }

  // Display results (human-readable format)
  const errors = aggregated.allIssues.filter((i) => i.severity === 'error');
  const warnings = aggregated.allIssues.filter((i) => i.severity === 'warning');
  const infos = aggregated.allIssues.filter((i) => i.severity === 'info');

  // In quiet mode, only show errors and exit silently if no errors
  if (quiet) {
    if (errors.length === 0) {
      return DoctorExitCode.SUCCESS; // Silent success
    }
    // Only display errors in quiet mode
    console.log(chalk.red.bold(`❌ Errors (${errors.length}):`));
    const errorsBySource = groupBySource(errors);
    for (const [source, sourceErrors] of Object.entries(errorsBySource)) {
      console.log(chalk.red(`\n  [${source}]`));
      sourceErrors.forEach((issue) => {
        console.log(chalk.red(`    • ${formatIssueMessage(issue)}`));
        if (issue.details) {
          console.log(chalk.dim(`      ${issue.details}`));
        }
      });
    }
    return DoctorExitCode.VALIDATION_ERROR;
  }

  if (errors.length === 0 && warnings.length === 0 && (!verbose || infos.length === 0)) {
    console.log(
      chalk.green(
        `✅ All ${mcpResults.length} configuration file(s) are valid - no issues found\n`,
      ),
    );
    return DoctorExitCode.SUCCESS;
  }

  // Display errors grouped by source
  if (errors.length > 0) {
    console.log(chalk.red.bold(`❌ Errors (${errors.length}):`));
    const errorsBySource = groupBySource(errors);
    for (const [source, sourceErrors] of Object.entries(errorsBySource)) {
      console.log(chalk.red(`\n  [${source}]`));
      sourceErrors.forEach((issue) => {
        console.log(chalk.red(`    • ${formatIssueMessage(issue)}`));
        if (issue.details) {
          console.log(chalk.dim(`      ${issue.details}`));
        }
      });
    }
    console.log();
  }

  // Display warnings grouped by source
  if (warnings.length > 0) {
    console.log(chalk.yellow.bold(`⚠️  Warnings (${warnings.length}):`));
    const warningsBySource = groupBySource(warnings);
    for (const [source, sourceWarnings] of Object.entries(warningsBySource)) {
      console.log(chalk.yellow(`\n  [${source}]`));
      sourceWarnings.forEach((issue) => {
        console.log(chalk.yellow(`    • ${formatIssueMessage(issue)}`));
        if (issue.details) {
          console.log(chalk.dim(`      ${issue.details}`));
        }
      });
    }
    console.log();
  }

  // Display info messages (only in verbose mode)
  if (verbose && infos.length > 0) {
    console.log(chalk.blue.bold(`ℹ️  Info (${infos.length}):`));
    const infosBySource = groupBySource(infos);
    for (const [source, sourceInfos] of Object.entries(infosBySource)) {
      console.log(chalk.blue(`\n  [${source}]`));
      sourceInfos.forEach((issue) => {
        console.log(chalk.blue(`    • ${formatIssueMessage(issue)}`));
        if (issue.details) {
          console.log(chalk.dim(`      ${issue.details}`));
        }
      });
    }
    console.log();
  }

  // Display recommendations for both errors and warnings
  displayRecommendations([...errors, ...warnings]);

  // Summary
  console.log(chalk.bold('Summary:'));
  console.log(`  ${totalConfigs} config file(s) validated`);
  console.log(`  ${aggregated.totalServerCount} total server(s) configured`);
  if (verbose && infos.length > 0) {
    console.log(
      `  ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info(s) found`,
    );
  } else {
    console.log(`  ${errors.length} error(s), ${warnings.length} warning(s) found`);
  }

  if (errors.length > 0) {
    console.log(chalk.red('\n❌ Configuration has errors that should be fixed'));
    displayHelpFooter();
    return DoctorExitCode.VALIDATION_ERROR;
  }

  console.log(chalk.green('\n✅ Configuration structure is valid (warnings can be reviewed)'));
  displayHelpFooter();
  return DoctorExitCode.SUCCESS;
}

/**
 * Display a helpful footer with links to documentation and support channels.
 */
function displayHelpFooter(): void {
  console.log(chalk.dim('\n─────────────────────────────────────────────────────────────────'));
  console.log(chalk.dim('📚 Configuration Guide:'));
  console.log(chalk.cyan(`   ${DOCUMENTATION_URLS.CONFIGURATION}`));
  console.log(
    chalk.dim(
      `\n💬 Need help? Open an issue at ${SUPPORT.ISSUES} with the output of this doctor command.`,
    ),
  );
}

/**
 * Display recommendations based on issue types.
 * Uses the co-located ISSUE_RECOMMENDATIONS from issue-codes.ts for maintainability.
 *
 * @param issues - Array of validation issues (errors and/or warnings) to show recommendations for
 */
function displayRecommendations(issues: ValidationIssue[]): void {
  const recommendations = getRecommendations(issues);

  for (const lines of recommendations.values()) {
    lines.forEach((line) => console.log(chalk.cyan(line)));
    console.log();
  }
}
