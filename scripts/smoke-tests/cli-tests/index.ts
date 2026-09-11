/**
 * CLI Test Runner - Executes command tests and reports results
 */

import type {
  CLITestOptions,
  TestCase,
  TestReport,
  TestResult
} from '../types';
import { createEmptyReport, updateReportSummary } from '../types';
import type { ReleaseChannel } from '../utils/artifact-downloader';
import { runCommand } from '../utils/binary-runner';
import { detectPlatform, getArchitecture, validateBinary } from '../utils/platform';
import { cliTestCases, filterTests, getRunnableTests } from './expected-outputs';
import { ensureTestConfig } from './generate-config';

/**
 * ANSI color codes for console output
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

/**
 * Run a single test case
 */
async function runTestCase(
  binaryPath: string,
  testCase: TestCase,
  configPath: string,
  verbose: boolean = false
): Promise<TestResult> {
  const startTime = performance.now();
  
  // Handle skipped tests
  if (testCase.skip) {
    return {
      id: testCase.id,
      name: testCase.name,
      status: 'skipped',
      duration: 0,
      validations: [],
      error: testCase.skipReason
    };
  }
  
  try {
    // Inject --config flag except for --version/--help
    const skipConfig = testCase.args[0] === '--version' || testCase.args[0] === '--help';
    const finalArgs = skipConfig ? testCase.args : ['--config', configPath, ...testCase.args];
    
    const result = await runCommand(binaryPath, finalArgs, {
      timeout: testCase.timeout || 30000
    });
    
    // Run validations
    const validations = testCase.validate(result);
    const allPassed = validations.every(v => v.passed);
    
    const duration = performance.now() - startTime;
    
    return {
      id: testCase.id,
      name: testCase.name,
      status: allPassed ? 'passed' : 'failed',
      duration,
      validations,
      commandResult: verbose ? result : undefined
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    
    return {
      id: testCase.id,
      name: testCase.name,
      status: 'error',
      duration,
      validations: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Print test result to console
 */
function printTestResult(result: TestResult, verbose: boolean = false): void {
  const statusIcon = {
    passed: `${colors.green}✓${colors.reset}`,
    failed: `${colors.red}✗${colors.reset}`,
    skipped: `${colors.yellow}○${colors.reset}`,
    error: `${colors.red}!${colors.reset}`
  }[result.status];
  
  const statusColor = {
    passed: colors.green,
    failed: colors.red,
    skipped: colors.yellow,
    error: colors.red
  }[result.status];
  
  const duration = result.duration > 0 
    ? `${colors.dim}(${result.duration.toFixed(0)}ms)${colors.reset}` 
    : '';
  
  console.log(`  ${statusIcon} ${result.name} ${duration}`);
  
  // Show failed validations
  if (result.status === 'failed' && result.validations.length > 0) {
    for (const v of result.validations) {
      if (!v.passed) {
        console.log(`      ${colors.red}└─ ${v.message}${colors.reset}`);
        if (v.expected) {
          console.log(`         Expected: ${v.expected}`);
        }
        if (v.actual) {
          console.log(`         Actual: ${v.actual}`);
        }
      }
    }
  }
  
  // Show error
  if (result.status === 'error' && result.error) {
    console.log(`      ${colors.red}└─ Error: ${result.error}${colors.reset}`);
  }
  
  // Show skip reason
  if (result.status === 'skipped' && result.error) {
    console.log(`      ${colors.yellow}└─ ${result.error}${colors.reset}`);
  }
  
  // Verbose: show command output
  if (verbose && result.commandResult) {
    console.log(`      ${colors.dim}Command: ${result.commandResult.command} ${result.commandResult.args.join(' ')}${colors.reset}`);
    if (result.commandResult.stdout) {
      const preview = result.commandResult.stdout.split('\n').slice(0, 3).join('\n');
      console.log(`      ${colors.dim}Stdout (preview): ${preview}${colors.reset}`);
    }
  }
}

/**
 * Print summary
 */
function printSummary(report: TestReport): void {
  console.log('');
  console.log(`${colors.bold}Summary${colors.reset}`);
  console.log('─'.repeat(40));
  
  const { summary } = report;
  
  console.log(`  Total:   ${summary.total}`);
  console.log(`  ${colors.green}Passed:  ${summary.passed}${colors.reset}`);
  
  if (summary.failed > 0) {
    console.log(`  ${colors.red}Failed:  ${summary.failed}${colors.reset}`);
  }
  if (summary.skipped > 0) {
    console.log(`  ${colors.yellow}Skipped: ${summary.skipped}${colors.reset}`);
  }
  if (summary.errors > 0) {
    console.log(`  ${colors.red}Errors:  ${summary.errors}${colors.reset}`);
  }
  
  console.log(`  Duration: ${(report.duration / 1000).toFixed(2)}s`);
  console.log('');
  
  if (report.success) {
    console.log(`${colors.green}${colors.bold}All tests passed!${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bold}Some tests failed.${colors.reset}`);
  }
}

/**
 * Generate GitHub Actions Job Summary (markdown)
 */
function generateJobSummary(report: TestReport): string {
  const { summary } = report;
  const icon = report.success ? '✅' : '❌';
  
  let md = `## ${icon} CLI Smoke Test Results\n\n`;
  md += `| Metric | Value |\n|--------|-------|\n`;
  md += `| Platform | \`${report.platform}-${report.architecture}\` |\n`;
  md += `| Duration | ${(report.duration / 1000).toFixed(2)}s |\n`;
  md += `| **Passed** | ${summary.passed}/${summary.total} |\n`;
  if (summary.failed > 0) md += `| **Failed** | ${summary.failed} |\n`;
  if (summary.skipped > 0) md += `| Skipped | ${summary.skipped} |\n`;
  
  md += `\n### Test Results\n\n`;
  md += `| Status | Test |\n|--------|------|\n`;
  
  for (const r of report.results) {
    const status = { passed: '✅', failed: '❌', skipped: '⏭️', error: '💥' }[r.status];
    md += `| ${status} | ${r.name} |\n`;
  }
  
  // Show failure details
  const failures = report.results.filter(r => r.status === 'failed' || r.status === 'error');
  if (failures.length > 0) {
    md += `\n### Failures\n\n`;
    for (const f of failures) {
      md += `**${f.name}**\n`;
      if (f.error) md += `> ${f.error}\n`;
      for (const v of f.validations.filter(v => !v.passed)) {
        md += `- ${v.message}\n`;
        if (v.expected) md += `  - Expected: \`${v.expected}\`\n`;
        if (v.actual) md += `  - Actual: \`${v.actual}\`\n`;
      }
      md += '\n';
    }
  }
  
  return md;
}

/**
 * Write job summary to GitHub Actions (if running in CI)
 */
async function writeJobSummary(report: TestReport): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  
  const md = generateJobSummary(report);
  await Bun.write(summaryPath, md);
}

/**
 * Run all CLI tests
 */
export async function runCLITests(options: CLITestOptions): Promise<TestReport> {
  const { binaryPath, verbose = false, filter, bail = false } = options;
  
  // Validate binary
  const validation = validateBinary(binaryPath);
  if (!validation.valid || !validation.resolvedPath) {
    throw new Error(`Binary not found: ${validation.error}`);
  }
  
  const resolvedPath = validation.resolvedPath;
  
  // Create report
  const report = createEmptyReport(
    resolvedPath,
    detectPlatform(),
    getArchitecture()
  );
  report.startTime = new Date();
  
  // Get tests to run
  let tests = getRunnableTests();
  if (filter) {
    tests = filterTests(filter);
    console.log(`${colors.blue}Filtering tests with pattern: ${filter}${colors.reset}`);
  }
  
  // Also include skipped tests for reporting
  const allTests = filter ? filterTests(filter) : cliTestCases;
  
  console.log('');
  console.log(`${colors.bold}QNSC-MCP CLI Tests${colors.reset}`);
  console.log('─'.repeat(40));
  console.log(`Platform: ${detectPlatform()}-${getArchitecture()}`);
  console.log(`Binary: ${resolvedPath}`);
  console.log(`Tests:  ${tests.length} runnable, ${allTests.length - tests.length} skipped`);
  
  // Generate config with all tools enabled
  const config = ensureTestConfig();
  console.log(`Config: ${config.path}`);
  console.log(`  Categories (${config.categories.length}): ${config.categories.join(', ')}`);
  console.log(`  MCPs (${config.mcps.length}): ${config.mcps.join(', ')}`);
  console.log('');
  
  // Run tests
  for (const testCase of allTests) {
    const result = await runTestCase(resolvedPath, testCase, config.path, verbose);
    report.results.push(result);
    printTestResult(result, verbose);
    
    // Bail on failure if requested
    if (bail && (result.status === 'failed' || result.status === 'error')) {
      console.log(`${colors.red}Bailing due to test failure${colors.reset}`);
      break;
    }
  }
  
  // Finalize report
  report.endTime = new Date();
  report.duration = report.endTime.getTime() - report.startTime.getTime();
  updateReportSummary(report);
  
  // Print summary
  printSummary(report);
  
  // Write GitHub Actions job summary
  await writeJobSummary(report);
  
  return report;
}

// Run when executed directly
if (import.meta.main) {
  const { findBinary, detectPlatform, getArchitecture } = await import('../utils/platform');
  const { downloadLatestBinaryForPlatform, getArtifactNameForPlatform, getLatestReleaseVersion, getGitHubConfig, downloadBinaryFromPR } = await import('../utils/artifact-downloader');
  const { getVersion } = await import('../utils/binary-runner');
  
  // Parse simple args
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const bail = args.includes('--bail');
  const forceDownload = args.includes('--force') || args.includes('-f');
  const skipDownload = args.includes('--local') || args.includes('-l');
  const filterIndex = args.indexOf('--filter');
  const filter = filterIndex >= 0 ? args[filterIndex + 1] : undefined;
  
  // Parse PR number: --pr <number>
  const prIndex = args.indexOf('--pr');
  const prNumber = prIndex >= 0 ? parseInt(args[prIndex + 1], 10) : undefined;
  
  // Parse version: --beta, --version <version>, or default to 'stable'
  const isBeta = args.includes('--beta');
  const versionIndex = args.indexOf('--version');
  const channel: ReleaseChannel = isBeta ? 'beta' : (versionIndex >= 0 ? args[versionIndex + 1] as ReleaseChannel : 'stable');
  
  // Find binary path
  let binaryPath: string | null = null;
  const binaryIndex = args.indexOf('--binary');
  
  if (binaryIndex >= 0 && args[binaryIndex + 1]) {
    // Explicit binary path provided
    binaryPath = args[binaryIndex + 1];
  } else if (prNumber) {
    // Download binary from PR workflow artifacts
    console.log(`${colors.blue}Downloading binary from PR #${prNumber}...${colors.reset}`);
    
    try {
      binaryPath = await downloadBinaryFromPR(prNumber, undefined, forceDownload);
      console.log(`${colors.green}✓ Downloaded PR binary${colors.reset}`);
      console.log(`  Path: ${binaryPath}`);
    } catch (error) {
      console.error(`${colors.red}Failed to download binary from PR #${prNumber}${colors.reset}`);
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  } else if (!skipDownload) {
    // Get target version for the channel
    const channelLabel = channel === 'stable' ? 'latest stable' : channel;
    console.log(`${colors.blue}Checking ${channelLabel} version...${colors.reset}`);
    
    try {
      const config = getGitHubConfig();
      const targetVersion = await getLatestReleaseVersion(config, channel);
      
      if (targetVersion) {
        console.log(`  Target: ${targetVersion}`);
        
        // Look for cached versioned binary
        binaryPath = findBinary('qnsc-mcp', [], targetVersion);
        
        if (binaryPath && !forceDownload) {
          console.log(`${colors.green}✓ Found cached binary${colors.reset}`);
          console.log(`  Path: ${binaryPath}`);
        } else {
          // Download the versioned binary
          binaryPath = await downloadLatestBinaryForPlatform(undefined, forceDownload, channel);
        }
      } else {
        console.log(`${colors.yellow}No ${channelLabel} release found${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.yellow}Note: Could not check for releases.${colors.reset}`);
      if (verbose) {
        console.log(`  Error: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  
  // If still no binary, try to find any local binary
  if (!binaryPath) {
    binaryPath = findBinary();
    if (binaryPath) {
      console.log(`${colors.yellow}Using local binary: ${binaryPath}${colors.reset}`);
    }
  }
  
  if (!binaryPath) {
    console.error(`${colors.red}No binary found.${colors.reset}`);
    console.log(`
Usage:
  bun run smoke-test                   # Auto-download latest stable release
  bun run smoke-test --beta            # Download and test latest beta release
  bun run smoke-test --pr <number>     # Download and test binary from PR workflow artifacts
  bun run smoke-test --binary <path>   # Test specific binary
  bun run smoke-test --local           # Only use local binary, skip download

Options:
  --binary, -b <path>   Path to the binary to test
  --local, -l           Only look for local binary, don't download
  --force, -f           Force re-download even if cached artifact is up to date
  --beta                Download latest beta/prerelease version
  --version <tag>       Download specific version (e.g., v3.1.0)
  --pr <number>         Download binary from a PR's workflow artifacts
  --verbose, -v         Show detailed output
  --bail                Stop on first failure
  --filter <pattern>    Only run tests matching pattern

Current platform: ${detectPlatform()}-${getArchitecture()}
Expected artifact: ${getArtifactNameForPlatform()}
`);
    process.exit(1);
  }
  
  try {
    const report = await runCLITests({
      binaryPath,
      verbose,
      filter,
      bail
    });
    
    process.exit(report.success ? 0 : 1);
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}
