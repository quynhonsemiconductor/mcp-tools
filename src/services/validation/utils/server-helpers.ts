/**
 * Server helper utilities for MCP config validation
 *
 * Provides common patterns for iterating over server configurations
 * in both 'servers' and 'mcpServers' format.
 */

import type { McpConfigContext, McpServerConfig } from '../types';

/**
 * Extract servers from an MCP config context.
 * Handles both 'servers' (VS Code/Cline) and 'mcpServers' (Claude Desktop) formats.
 *
 * @param context - The MCP config context
 * @returns Record of server name to server config
 *
 * @example
 * ```typescript
 * const servers = getServersFromContext(context);
 * for (const [serverName, serverConfig] of Object.entries(servers)) {
 *   // validate server...
 * }
 * ```
 */
export function getServersFromContext(context: McpConfigContext): Record<string, McpServerConfig> {
  const config = context.config;
  return (config.servers || config.mcpServers || {}) as Record<string, McpServerConfig>;
}

/**
 * Iterate over servers in an MCP config context with a callback.
 * A convenience wrapper that handles the common iteration pattern.
 *
 * The callback can optionally return `false` to stop iteration early.
 * Any other return value (including `undefined`) continues iteration.
 *
 * @param context - The MCP config context
 * @param callback - Function called for each server with (serverName, serverConfig).
 *                   Return `false` to stop iteration early.
 *
 * @example
 * ```typescript
 * // Basic usage - iterate all servers
 * forEachServer(context, (serverName, serverConfig) => {
 *   if (!serverConfig.command) {
 *     issues.push({ ... });
 *   }
 * });
 *
 * // Early termination - stop after finding first issue
 * forEachServer(context, (serverName, serverConfig) => {
 *   if (hasCriticalIssue(serverConfig)) {
 *     issues.push({ ... });
 *     return false; // Stop iterating
 *   }
 * });
 * ```
 */
export function forEachServer(
  context: McpConfigContext,
  callback: (serverName: string, serverConfig: McpServerConfig) => void | boolean,
): void {
  const servers = getServersFromContext(context);
  for (const [serverName, serverConfig] of Object.entries(servers)) {
    if (callback(serverName, serverConfig) === false) {
      break;
    }
  }
}

/**
 * Get the number of servers configured in an MCP config.
 *
 * @param context - The MCP config context
 * @returns Number of servers
 */
export function getServerCount(context: McpConfigContext): number {
  const servers = getServersFromContext(context);
  return Object.keys(servers).length;
}
