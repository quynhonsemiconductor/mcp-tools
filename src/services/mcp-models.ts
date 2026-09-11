/**
 * mcp-models.ts - Unified data models for MCP operations
 *
 * This module defines the standard data structures used across all MCP types
 * (native, bundled, remote, local). These unified models ensure consistency
 * and reduce duplication in transformation logic.
 */

/**
 * Provider type for MCP sources
 */
export type MCPProvider = 'native' | 'bundled' | 'remote' | 'local';

/**
 * Connection status for MCP servers
 */
export type MCPConnectionStatus = 'connected' | 'disconnected' | 'error';

/**
 * Unified environment variable definition
 * Standardizes how environment variables are represented across all MCP types
 */
export interface UnifiedEnvVar {
  /** Environment variable key/name */
  key: string;
  /** Human-readable description of what this variable is for */
  description: string;
  /** Whether this environment variable is required */
  required: boolean;
}

/**
 * Unified tool information
 * Standardizes how tools are represented across all MCP types
 */
export interface UnifiedToolInfo {
  /** Unique tool identifier (format varies by provider) */
  id: string;
  /** Raw tool name from the MCP server */
  name: string;
  /** Display name for UI (may include MCP prefix) */
  displayName: string;
  /** Tool description */
  description: string;
  /** Category for organizing tools in UI */
  category: string;
  /** ID of the parent MCP server */
  mcpId: string;
  /** Name of the parent MCP server */
  mcpName: string;
  /** Provider type (native, bundled, remote, local) */
  provider: MCPProvider;
  /** JSON schema for tool parameters */
  parameters: any;
  /** Additional metadata/annotations from the tool */
  annotations?: any;
  /**
   * Tool-specific environment variables (optional)
   * If undefined or omitted, the tool uses the MCP-level envVars.
   * Only populated when tool has different envVars than the parent MCP.
   * This optimization reduces network payload size.
   */
  envVars?: UnifiedEnvVar[];
}

/**
 * Unified MCP server information
 * Standardizes how MCP servers are represented regardless of type
 */
export interface UnifiedMCPInfo {
  /** Unique identifier for this MCP */
  id: string;
  /** Internal name used for lookups */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Description of what this MCP provides */
  description: string;
  /** Category for organizing MCPs in UI */
  category: string;
  /** Provider type (native, bundled, remote, local) */
  provider: MCPProvider;
  /** Whether this MCP is enabled in configuration */
  enabled: boolean;
  /** Current connection status */
  connected: boolean;
  /** Version string (if available) */
  version?: string;
  /** URL for remote MCPs */
  url?: string;
  /** Installation commands to run. */
  installation?: string | string[];
  /** Launch command to start the mcp server.  */
  launch?: string;
  /**
   * Required environment variables for this MCP server
   * This is an aggregated set of all unique environment variables required by
   * the MCP server and all its tools. This provides a complete view of all
   * env vars needed to use this MCP.
   */
  envVars: UnifiedEnvVar[];
  /** Tools provided by this MCP */
  tools: UnifiedToolInfo[];
}

/**
 * Tool call statistics
 * Used for tracking tool usage
 */
export interface ToolCallStats {
  /** Number of calls with this status */
  count: number;
  /** Call status (success, error, etc.) */
  status: string;
}

/**
 * Detailed tool information including call statistics
 * Extended version of UnifiedToolInfo with additional runtime data
 */
export interface DetailedToolInfo extends UnifiedToolInfo {
  /** Statistics about tool calls */
  callStats: ToolCallStats[];
  /** MCP version (for bundled MCPs) */
  mcpVersion?: string;
  /** Environment variables required for this tool */
  envVars: UnifiedEnvVar[];
}

/**
 * Parsed tool ID components
 * Result of parsing a tool ID back into its constituent parts
 */
export interface ParsedToolId {
  /** Provider type extracted from ID */
  provider: MCPProvider | null;
  /** MCP name extracted from ID */
  mcpName: string | null;
  /** Tool name extracted from ID */
  toolName: string | null;
  /** Whether the ID was successfully parsed */
  isValid: boolean;
}

/**
 * MCP service options for initialization
 */
export interface MCPServiceOptions {
  /** Directory for bundled MCPs */
  bundledMcpDir?: string;
  /** Whether to enable caching */
  enableCache?: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL?: number;
}

/**
 * MCP statistics
 * Aggregated statistics across all MCP types
 */
export interface MCPStats {
  /** Total number of MCP servers */
  totalServers: number;
  /** Number of connected servers */
  connectedServers: number;
  /** Total number of tools */
  totalTools: number;
  /** Number of enabled servers */
  enabledServers: number;
  /** Breakdown by provider type */
  byProvider: {
    native: { servers: number; tools: number };
    bundled: { servers: number; tools: number };
    remote: { servers: number; tools: number };
    local: { servers: number; tools: number };
  };
}
