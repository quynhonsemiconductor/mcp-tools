/**
 * Expected output definitions for CLI command tests
 *
 * Defines validation rules for each CLI command
 */

import type { TestCase } from '../types';
import type { CommandResult } from '../utils/binary-runner';
import {
  validateContains,
  validateContainsAll,
  validateExitCode,
  validateJSON,
  validateJSONArray,
  validateNoTimeout,
  validatePattern,
  validateSemver,
  validateToolCount
} from '../utils/output-validator';

/**
 * All CLI command test cases
 */
export const cliTestCases: TestCase[] = [
  // --version
  {
    id: 'cli-version',
    name: 'Version Command',
    description: 'Binary reports version in semver format',
    args: ['--version'],
    timeout: 10000,
    validate: (result: CommandResult) => {
      const output = (result.stdout + result.stderr).trim();
      const versionMatch = output.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
      const version = versionMatch ? versionMatch[1] : output;

      return [
        validateExitCode(result, 0),
        validateNoTimeout(result),
        validateSemver(version)
      ];
    }
  },

  // --help
  {
    id: 'cli-help',
    name: 'Help Command',
    description: 'Binary displays help with expected commands',
    args: ['--help'],
    timeout: 10000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result),
      validateContainsAll(result, [
        'list-tools',
        'list-prompts',
        'list-resources',
        'doctor',
        'update',
        'install',
        'generate-config'
      ]),
      validateContains(result, 'Usage:')
    ]
  },

  // info
  {
    id: 'cli-info',
    name: 'Info Command',
    description: 'Binary displays server information',
    args: ['info'],
    timeout: 10000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result),
      validateContains(result, 'Version:'),
      validateContains(result, 'Config')
    ]
  },

  // list-tools (basic)
  {
    id: 'cli-list-tools',
    name: 'List Tools Command',
    description: 'Binary lists available tools',
    args: ['list-tools'],
    timeout: 30000, // Tools loading can take time
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result),
      // Should have substantial output (tools list)
      validatePattern(result, /\w+/, 'has tool names')
    ]
  },

  // list-tools --json
  {
    id: 'cli-list-tools-json',
    name: 'List Tools JSON Command',
    description: 'Binary lists tools in JSON format',
    args: ['list-tools', '--json'],
    timeout: 30000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result),
      validateJSON(result),
      validateToolCount(result, 100) // Expect at least 100 tools
    ]
  },

  // list-prompts
  {
    id: 'cli-list-prompts',
    name: 'List Prompts Command',
    description: 'Binary lists available prompts',
    args: ['list-prompts'],
    timeout: 30000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result)
    ]
  },

  // list-resources
  {
    id: 'cli-list-resources',
    name: 'List Resources Command',
    description: 'Binary lists available resources',
    args: ['list-resources'],
    timeout: 30000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result)
    ]
  },

  // list-bundled-mcps
  {
    id: 'cli-list-bundled-mcps',
    name: 'List Bundled MCPs Command',
    description: 'Binary lists bundled MCP servers',
    args: ['list-bundled-mcps'],
    timeout: 30000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result)
    ]
  },

  // list-bundled-mcps --json
  {
    id: 'cli-list-bundled-mcps-json',
    name: 'List Bundled MCPs JSON Command',
    description: 'Binary lists bundled MCPs in JSON format',
    args: ['list-bundled-mcps', '--json'],
    timeout: 30000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result),
      validateJSONArray(result)
    ]
  },

  // list-remote-mcps
  {
    id: 'cli-list-remote-mcps',
    name: 'List Remote MCPs Command',
    description: 'Binary lists remote MCP servers',
    args: ['list-remote-mcps'],
    timeout: 60000, // Remote MCPs may need network
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateContains(result, 'Available Remote MCP Servers'),
      validateNoTimeout(result)
    ]
  },

  // list-remote-mcps tools
  {
    id: 'cli-list-remote-mcps',
    name: 'List Remote MCPs Command',
    description: 'Binary lists remote MCP servers',
    args: ['list-remote-mcps', '--tools'],
    timeout: 60000, // Remote MCPs may need network
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateContains(result, 'Remote MCPs'),
      validateNoTimeout(result)
    ]
  },

  // list-local-mcps
  {
    id: 'cli-list-local-mcps',
    name: 'List Local MCPs Command',
    description: 'Binary lists local MCP configurations',
    args: ['list-local-mcps'],
    timeout: 30000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result)
    ]
  },

  // doctor
  {
    id: 'cli-doctor',
    name: 'Doctor Command',
    description: 'Binary runs diagnostic checks',
    args: ['doctor'],
    timeout: 60000,
    validate: (result: CommandResult) => [
      // Doctor may return non-zero if issues found, but shouldn't crash
      validateNoTimeout(result),
      // Should have some diagnostic output
      validatePattern(result, /.+/, 'has diagnostic output')
    ]
  },

  // doctor --json
  {
    id: 'cli-doctor-json',
    name: 'Doctor JSON Command',
    description: 'Binary runs diagnostics with JSON output',
    args: ['doctor', '--json'],
    timeout: 60000,
    validate: (result: CommandResult) => [
      validateNoTimeout(result),
      validateJSON(result)
    ]
  },

  // generate-config (dry run - just check help works)
  {
    id: 'cli-generate-config-help',
    name: 'Generate Config Help',
    description: 'Generate config command accepts --help',
    args: ['generate-config', '--help'],
    timeout: 10000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result)
    ]
  },

  // update --check-only
  {
    id: 'cli-update-check',
    name: 'Update Check Command',
    description: 'Binary checks for updates without installing',
    args: ['update', '--check-only'],
    timeout: 30000, // Network call to check for updates
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result),
      // Should mention version or update status
      validatePattern(
        result,
        /version|update|latest|current/i,
        'mentions version/update status'
      )
    ]
  },

  // view-logs
  {
    id: 'cli-view-logs',
    name: 'View Logs Command',
    description: 'Binary displays log file contents',
    args: ['view-logs'],
    timeout: 10000,
    validate: (result: CommandResult) => [
      // May exit 0 if logs exist, or non-zero if no logs - both are valid
      validateNoTimeout(result)
    ]
  },

  // view-logs --help
  {
    id: 'cli-view-logs-help',
    name: 'View Logs Help',
    description: 'View logs command accepts --help',
    args: ['view-logs', '--help'],
    timeout: 10000,
    validate: (result: CommandResult) => [
      validateExitCode(result, 0),
      validateNoTimeout(result),
      validateContains(result, 'tail')
    ]
  }
];

/**
 * Get runnable tests (not skipped)
 */
export function getRunnableTests(): TestCase[] {
  return cliTestCases.filter((tc) => !tc.skip);
}

/**
 * Filter tests by pattern (matches against id or name)
 */
export function filterTests(pattern: string): TestCase[] {
  const regex = new RegExp(pattern, 'i');
  return cliTestCases.filter((tc) => regex.test(tc.id) || regex.test(tc.name));
}
