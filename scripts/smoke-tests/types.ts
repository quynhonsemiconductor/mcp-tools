/**
 * Shared types for the binary release testing framework
 */

import type { CommandResult } from './utils/binary-runner';
import type { ValidationResult } from './utils/output-validator';

/**
 * Status of a test
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'error';

/**
 * Individual test case result
 */
export interface TestResult {
  /** Unique test identifier */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Test status */
  status: TestStatus;
  /** Duration in milliseconds */
  duration: number;
  /** Validation results for this test */
  validations: ValidationResult[];
  /** Error message if status is 'error' */
  error?: string;
  /** Raw command result if applicable */
  commandResult?: CommandResult;
}

/**
 * Test case configuration
 */
export interface TestCase {
  /** Unique test identifier */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Description of what this test validates */
  description: string;
  /** Command arguments to pass to the binary */
  args: string[];
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Function to validate the command result */
  validate: (result: CommandResult) => ValidationResult[];
  /** Whether this test should be skipped */
  skip?: boolean;
  /** Skip reason if skipped */
  skipReason?: string;
}

/**
 * Aggregated test report
 */
export interface TestReport {
  /** Report title */
  title: string;
  /** Binary path that was tested */
  binaryPath: string;
  /** Binary version if detected */
  version?: string;
  /** Platform the tests ran on */
  platform: string;
  /** Architecture */
  architecture: string;
  /** Timestamp when tests started */
  startTime: Date;
  /** Timestamp when tests ended */
  endTime: Date;
  /** Total duration in milliseconds */
  duration: number;
  /** Summary counts */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
  };
  /** Individual test results */
  results: TestResult[];
  /** Overall pass/fail */
  success: boolean;
}

/**
 * Test runner options
 */
export interface TestRunnerOptions {
  /** Path to the binary */
  binaryPath: string;
  /** Enable verbose output */
  verbose?: boolean;
  /** Only run tests matching this pattern */
  filter?: string;
  /** Stop on first failure */
  bail?: boolean;
  /** Output directory for reports */
  outputDir?: string;
}

/**
 * CLI-specific options
 */
export interface CLITestOptions extends TestRunnerOptions {
  /** Specific commands to test */
  commands?: string[];
}

/**
 * Creates an empty test report
 */
export function createEmptyReport(
  binaryPath: string,
  platform: string,
  architecture: string
): TestReport {
  return {
    title: 'QNSC-MCP Binary Release Test Report',
    binaryPath,
    platform,
    architecture,
    startTime: new Date(),
    endTime: new Date(),
    duration: 0,
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 0
    },
    results: [],
    success: true
  };
}

/**
 * Updates report summary from results
 */
export function updateReportSummary(report: TestReport): void {
  report.summary = {
    total: report.results.length,
    passed: report.results.filter(r => r.status === 'passed').length,
    failed: report.results.filter(r => r.status === 'failed').length,
    skipped: report.results.filter(r => r.status === 'skipped').length,
    errors: report.results.filter(r => r.status === 'error').length
  };
  report.success = report.summary.failed === 0 && report.summary.errors === 0;
}

// Export utils for convenience
export type { CommandResult } from './utils/binary-runner';
export type { ValidationResult } from './utils/output-validator';

