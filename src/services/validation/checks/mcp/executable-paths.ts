/**
 * Executable path validation checks for MCP configs
 *
 * Validates that command executables and file path arguments exist and are
 * properly configured. This helps catch common configuration errors like:
 * - Typos in executable paths
 * - Missing execute permissions on scripts
 * - References to files that don't exist
 *
 * @example
 * // Will warn if node doesn't exist at this path
 * { "command": "/usr/local/bin/node" }
 *
 * // Will warn if script.js doesn't exist
 * { "command": "node", "args": ["./script.js"] }
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CHECK_PRIORITIES, NON_PATH_ARG_COMMANDS, VALIDATION_PATTERNS } from '../../constants';
import { MCP_ISSUE_CODES } from '../../issue-codes';
import type { McpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { forEachServer, isFilePath } from '../../utils';

/**
 * Check that executable paths exist and are executable.
 *
 * Only validates absolute paths to avoid false positives for commands
 * that rely on PATH resolution (e.g., "node", "python").
 * On Unix systems, also checks for execute permissions.
 */
export const executablePathValidation = {
  id: 'mcp.executable-paths',
  name: 'Executable path validation',
  description: 'Validates that command executables exist and have execute permissions',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.EXECUTABLE_PATHS,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    forEachServer(context, (serverName, serverConfig) => {
      if (!serverConfig.command) return;

      const command = serverConfig.command;

      // Only check absolute paths
      if (!path.isAbsolute(command)) return;

      // Check if file exists
      if (!fs.existsSync(command)) {
        issues.push({
          severity: 'warning',
          code: MCP_ISSUE_CODES.EXECUTABLE_NOT_FOUND,
          message: `Executable not found: ${command}`,
          details: 'The command path does not exist. Verify the path is correct.',
          serverName,
        });
        return;
      }

      // Check execute permissions (Unix only)
      if (os.platform() !== 'win32') {
        try {
          fs.accessSync(command, fs.constants.X_OK);
        } catch {
          issues.push({
            severity: 'warning',
            code: MCP_ISSUE_CODES.EXECUTABLE_NOT_EXECUTABLE,
            message: `File lacks execute permission: ${command}`,
            details: 'Run chmod +x on the file to add execute permissions.',
            serverName,
          });
        }
      }
    });

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;

/**
 * Check for file paths in args that don't exist.
 *
 * Validates that arguments that look like file paths actually exist.
 * Relative paths are resolved against the config file's directory.
 *
 * Commands whose args are references resolved by the tool itself rather than
 * host filesystem paths (container runtimes like docker/podman, package runners
 * like npx/uvx) are skipped entirely. Their args (e.g. "mcp/sonarqube" or
 * "@scope/pkg") legitimately contain "/" and would otherwise be misreported as
 * missing files. See NON_PATH_ARG_COMMANDS.
 */
export const argFilePathValidation = {
  id: 'mcp.arg-file-paths',
  name: 'Argument file path validation',
  description: 'Validates that file paths in args exist',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.ARG_FILE_PATHS,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const configDir = path.dirname(context.filePath);

    forEachServer(context, (serverName, serverConfig) => {
      if (!serverConfig.args || !Array.isArray(serverConfig.args)) return;

      // Skip commands whose positional args are references the tool resolves
      // itself (image names, package specifiers), not host filesystem paths.
      // Matched by basename so absolute command paths (e.g. /usr/local/bin/docker)
      // are handled too.
      const commandBase = serverConfig.command
        ? path.basename(serverConfig.command).toLowerCase()
        : '';
      if (NON_PATH_ARG_COMMANDS.has(commandBase)) return;

      for (const arg of serverConfig.args) {
        // Skip flags (args starting with -)
        if (arg.startsWith('-')) continue;

        if (!isFilePath(arg)) continue;

        // Resolve relative paths against config directory
        const resolvedPath =
          path.isAbsolute(arg) || VALIDATION_PATTERNS.WINDOWS_ABSOLUTE_PATH.test(arg)
            ? arg
            : path.resolve(configDir, arg);

        if (!fs.existsSync(resolvedPath)) {
          issues.push({
            severity: 'warning',
            code: MCP_ISSUE_CODES.ARG_FILE_NOT_FOUND,
            message: `File path in args not found: ${arg}`,
            details: 'Verify the file path is correct.',
            serverName,
          });
        }
      }
    });

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;
