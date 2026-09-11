/**
 * Duplicate executable detection for MCP configs
 */

import * as path from 'path';
import {
  ARGS_FOR_EXECUTABLE_UNIQUENESS,
  CHECK_PRIORITIES,
  VALIDATION_PATTERNS,
} from '../../constants';
import { MCP_ISSUE_CODES } from '../../issue-codes';
import type { McpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { getServersFromContext } from '../../utils';

/**
 * Normalize a command to its base name for comparison.
 * This handles cross-platform paths and removes common executable extensions.
 *
 * @param command - The command path to normalize
 * @returns Normalized command name in lowercase
 * @example
 * normalizeCommand('/usr/bin/node') // => 'node'
 * normalizeCommand('C:\\Program Files\\node.exe') // => 'node'
 * normalizeCommand('python3') // => 'python3'
 */
function normalizeCommand(command: string): string {
  // Get just the filename
  let basename = path.basename(command);
  // Remove common extensions
  basename = basename.replace(VALIDATION_PATTERNS.EXECUTABLE_EXTENSIONS, '');
  return basename.toLowerCase();
}

/**
 * Check for duplicate executables across servers.
 *
 * Detects when multiple MCP servers use the same executable with the same arguments.
 * This can cause unexpected behavior and conflicts. The check normalizes command paths
 * and considers the first 2 arguments when determining uniqueness.
 *
 * Note: Issues from this check intentionally omit the `serverName` field because
 * duplicates span multiple servers. The affected servers are listed in the `details` field.
 *
 * @example
 * // This would trigger a warning:
 * {
 *   "server1": { "command": "/usr/bin/node", "args": ["server.js"] },
 *   "server2": { "command": "node", "args": ["server.js"] }
 * }
 *
 * @example
 * // This would NOT trigger a warning (different first arg):
 * {
 *   "server1": { "command": "node", "args": ["server1.js"] },
 *   "server2": { "command": "node", "args": ["server2.js"] }
 * }
 */
export const duplicateExecutableCheck = {
  id: 'mcp.duplicate-executables',
  name: 'Duplicate executable check',
  description: 'Detects when multiple servers use the same executable',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.DUPLICATE_EXECUTABLES,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const servers = getServersFromContext(context);

    // Map of normalized executable -> list of { serverName, originalCommand }
    const executableMap = new Map<string, { serverName: string; originalCommand: string }[]>();

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      if (!serverConfig.command) continue;

      // Normalize the executable identifier (normalized command + first N args for uniqueness)
      const normalizedCommand = normalizeCommand(serverConfig.command);
      const args = serverConfig.args || [];
      const executableKey = [
        normalizedCommand,
        ...args.slice(0, ARGS_FOR_EXECUTABLE_UNIQUENESS),
      ].join(' ');

      const existing = executableMap.get(executableKey) || [];
      existing.push({ serverName, originalCommand: serverConfig.command });
      executableMap.set(executableKey, existing);
    }

    // Report duplicates
    for (const [, duplicateGroup] of executableMap) {
      if (duplicateGroup.length > 1) {
        const serverNames = duplicateGroup.map((s) => s.serverName);
        const originalCommands = [...new Set(duplicateGroup.map((s) => s.originalCommand))];
        issues.push({
          severity: 'warning',
          code: MCP_ISSUE_CODES.DUPLICATE_EXECUTABLE,
          message: `Duplicate executable found: ${originalCommands.join(' / ')}`,
          details: `Used by servers: ${serverNames.join(', ')}. This may cause unexpected behavior.`,
        });
      }
    }

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;
