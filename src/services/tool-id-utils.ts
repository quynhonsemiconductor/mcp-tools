/**
 * tool-id-utils.ts - Centralized tool ID generation and parsing utilities
 *
 * This module provides a single source of truth for tool ID generation across
 * all MCP types. It eliminates the duplication of createValidId() and tool ID
 * generation logic that was previously scattered across multiple files.
 */

import { MCPProvider, ParsedToolId } from './mcp-models';

/**
 * Tool ID delimiters for different MCP types
 */
export const TOOL_DELIMITERS = {
  bundled: '__',
  remote: '__',
  local: '__',
  native: '', // Native tools don't use a delimiter
} as const;

/**
 * Tool ID prefixes for different MCP types
 */
export const TOOL_PREFIXES = {
  bundled: '',
  remote: 'remote-',
  local: 'local-',
  native: '',
} as const;

/**
 * Creates a valid ID from a string by converting to lowercase and
 * replacing invalid characters with hyphens
 *
 * @param str - Input string to convert
 * @returns Valid ID string (lowercase, alphanumeric with hyphens)
 *
 * @example
 * createValidId('My Tool Name') // returns 'my-tool-name'
 * createValidId('tool@123!') // returns 'tool-123'
 */
export function createValidId(str: string): string {
  if (!str) {
    return 'unknown';
  }

  return str
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Gets the delimiter used for a specific MCP provider type
 *
 * @param provider - MCP provider type
 * @returns Delimiter string for that provider
 *
 * @example
 * getToolDelimiter('bundled') // returns '__'
 * getToolDelimiter('native') // returns ''
 */
export function getToolDelimiter(provider: MCPProvider): string {
  return TOOL_DELIMITERS[provider];
}

/**
 * Gets the prefix used for a specific MCP provider type
 *
 * @param provider - MCP provider type
 * @returns Prefix string for that provider
 *
 * @example
 * getToolPrefix('remote') // returns 'remote-'
 * getToolPrefix('bundled') // returns ''
 */
export function getToolPrefix(provider: MCPProvider): string {
  return TOOL_PREFIXES[provider];
}

/**
 * Creates a unified tool ID based on provider type, MCP name, and tool name
 *
 * Format patterns:
 * - Native: {toolName}
 * - Bundled: {mcpName}__{toolName}
 * - Remote: remote-{mcpName}__{toolName}
 * - Local: local-{mcpName}__{toolName}
 *
 * @param provider - MCP provider type
 * @param mcpName - Name of the MCP server (not used for native)
 * @param toolName - Name of the tool
 * @returns Formatted tool ID string
 *
 * @example
 * createToolId('bundled', 'playwright', 'browser_click')
 * // returns 'playwright__browser-click'
 *
 * createToolId('remote', 'GitHub', 'createIssue')
 * // returns 'remote-github__createissue'
 *
 * createToolId('native', '', 'webFetch')
 * // returns 'webfetch'
 */
export function createToolId(provider: MCPProvider, mcpName: string, toolName: string): string {
  const validToolName = createValidId(toolName);

  // Native tools don't need prefix or MCP name
  if (provider === 'native') {
    return validToolName;
  }

  const validMcpName = createValidId(mcpName);
  const prefix = TOOL_PREFIXES[provider];
  const delimiter = TOOL_DELIMITERS[provider];

  return `${prefix}${validMcpName}${delimiter}${validToolName}`;
}

/**
 * Creates a display name for a tool that includes the MCP prefix
 *
 * Format patterns:
 * - Native: {toolName}
 * - Bundled: {mcpName}__{toolName}
 * - Remote: {mcpName}__{toolName}
 * - Local: {mcpName}__{toolName}
 *
 * Note: Display names preserve the original casing where possible
 *
 * @param provider - MCP provider type
 * @param mcpName - Name of the MCP server
 * @param toolName - Name of the tool
 * @returns Formatted display name
 *
 * @example
 * createToolDisplayName('bundled', 'Playwright', 'browser_click')
 * // returns 'Playwright__browser_click'
 */
export function createToolDisplayName(
  provider: MCPProvider,
  mcpName: string,
  toolName: string,
): string {
  // Native tools use the tool name as-is
  if (provider === 'native') {
    return toolName;
  }

  const delimiter = TOOL_DELIMITERS[provider];
  return `${mcpName}${delimiter}${toolName}`;
}

/**
 * Parses a tool ID back into its constituent parts
 *
 * @param toolId - Tool ID to parse
 * @returns ParsedToolId object with provider, mcpName, and toolName
 *
 * @example
 * parseToolId('remote-github__createissue')
 * // returns {
 * //   provider: 'remote',
 * //   mcpName: 'github',
 * //   toolName: 'createissue',
 * //   isValid: true
 * // }
 *
 * parseToolId('playwright__browser-click')
 * // returns {
 * //   provider: 'bundled',
 * //   mcpName: 'playwright',
 * //   toolName: 'browser-click',
 * //   isValid: true
 * // }
 */
export function parseToolId(toolId: string): ParsedToolId {
  if (!toolId) {
    return {
      provider: null,
      mcpName: null,
      toolName: null,
      isValid: false,
    };
  }

  // Check for remote prefix
  if (toolId.startsWith(TOOL_PREFIXES.remote)) {
    const withoutPrefix = toolId.substring(TOOL_PREFIXES.remote.length);
    const parts = withoutPrefix.split(TOOL_DELIMITERS.remote);

    if (parts.length === 2) {
      return {
        provider: 'remote',
        mcpName: parts[0],
        toolName: parts[1],
        isValid: true,
      };
    }
  }

  // Check for local prefix
  if (toolId.startsWith(TOOL_PREFIXES.local)) {
    const withoutPrefix = toolId.substring(TOOL_PREFIXES.local.length);
    const parts = withoutPrefix.split(TOOL_DELIMITERS.local);

    if (parts.length === 2) {
      return {
        provider: 'local',
        mcpName: parts[0],
        toolName: parts[1],
        isValid: true,
      };
    }
  }

  // Check for bundled (no prefix, but has delimiter)
  if (toolId.includes(TOOL_DELIMITERS.bundled)) {
    const parts = toolId.split(TOOL_DELIMITERS.bundled);

    if (parts.length === 2) {
      return {
        provider: 'bundled',
        mcpName: parts[0],
        toolName: parts[1],
        isValid: true,
      };
    }
  }

  // Assume it's a native tool (no prefix, no delimiter)
  return {
    provider: 'native',
    mcpName: null,
    toolName: toolId,
    isValid: true,
  };
}

/**
 * Checks if a tool ID matches a specific MCP provider type
 *
 * @param toolId - Tool ID to check
 * @param provider - Provider type to check against
 * @returns True if the tool ID belongs to the specified provider
 *
 * @example
 * isToolFromProvider('remote-github__createissue', 'remote') // returns true
 * isToolFromProvider('playwright__browser-click', 'remote') // returns false
 */
export function isToolFromProvider(toolId: string, provider: MCPProvider): boolean {
  const parsed = parseToolId(toolId);
  return parsed.isValid && parsed.provider === provider;
}

/**
 * Extracts the MCP name from a tool ID
 *
 * @param toolId - Tool ID to extract from
 * @returns MCP name or null if not applicable (e.g., native tools)
 *
 * @example
 * getMCPNameFromToolId('remote-github__createissue') // returns 'github'
 * getMCPNameFromToolId('webFetch') // returns null
 */
export function getMCPNameFromToolId(toolId: string): string | null {
  const parsed = parseToolId(toolId);
  return parsed.isValid ? parsed.mcpName : null;
}

/**
 * Extracts the tool name from a tool ID
 *
 * @param toolId - Tool ID to extract from
 * @returns Tool name
 *
 * @example
 * getToolNameFromToolId('remote-github__createissue') // returns 'createissue'
 * getToolNameFromToolId('webFetch') // returns 'webFetch'
 */
export function getToolNameFromToolId(toolId: string): string | null {
  const parsed = parseToolId(toolId);
  return parsed.isValid ? parsed.toolName : null;
}
