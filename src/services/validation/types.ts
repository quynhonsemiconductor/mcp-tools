/**
 * Core types for the validation system
 */

/**
 * Severity level of a validation issue
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Common server configuration structure used by MCP configs.
 * Centralized here to avoid duplication across check implementations.
 */
export interface McpServerConfig {
  /** The command to execute */
  command?: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables for the server */
  env?: Record<string, string>;
}

/**
 * A validation issue found during checking
 */
export interface ValidationIssue {
  /** Severity of the issue */
  severity: ValidationSeverity;
  /** Machine-readable code for programmatic handling */
  code: string;
  /** Human-readable message */
  message: string;
  /** Optional additional details */
  details?: string;
  /** Optional server name this issue relates to */
  serverName?: string;
}

/**
 * Result of running validation checks
 */
export interface ValidationResult {
  /** Whether all checks passed without errors */
  valid: boolean;
  /** List of issues found */
  issues: ValidationIssue[];
  /** Number of servers validated (for MCP configs) */
  serverCount?: number;
  /** List of checks performed (when verbose mode enabled) */
  checksPerformed?: string[];
  /** Path to the config file that was validated (optional) */
  configPath?: string;
}

/**
 * Options for validation
 */
export interface ValidationOptions {
  /** Include list of checks performed in result */
  verbose?: boolean;
  /** Only run checks with these IDs (if specified) */
  only?: string[];
  /** Skip checks with these IDs */
  skip?: string[];
}

/**
 * Context types for different validation domains
 */
export type McpConfigContext = {
  type: 'mcp-config';
  /** The parsed config object */
  config: Record<string, unknown>;
  /** Path to the config file */
  filePath: string;
  /** The config format detected */
  format: 'servers' | 'mcpServers';
};

export type QnscMcpConfigContext = {
  type: 'qnsc-mcp-config';
  /** The parsed config object */
  config: Record<string, unknown>;
  /** Path to the config file (if found) */
  filePath?: string;
};

/**
 * Configuration structure for the tools section in .qnscmcp.yaml
 * Shared across QNSC-MCP validation checks to avoid duplication.
 */
export interface QnscMcpToolsConfig {
  /** List of tool IDs to include */
  include?: string[];
  /** List of tool IDs to exclude */
  exclude?: string[];
  /** List of categories to include */
  includeCategories?: string[];
  /** List of categories to exclude */
  excludeCategories?: string[];
  /** List of bundled MCP server IDs to include */
  includeMCPs?: string[];
  /** List of remote MCP server IDs to include */
  includeRemoteMCPs?: string[];
  /** List of local MCP server IDs to include */
  includeLocalMCPs?: string[];
}

/**
 * Union of all validation contexts
 */
export type ValidationContext = McpConfigContext | QnscMcpConfigContext;

/**
 * Interface that all validation checks must implement.
 *
 * Note: The run() method can return either synchronously or asynchronously.
 * The check registry wraps all returns in Promise.resolve() for consistency.
 * For simplicity, prefer returning Promise<ValidationIssue[]> for all checks
 * to maintain a consistent async pattern across the codebase.
 */
export interface ValidationCheck<T extends ValidationContext = ValidationContext> {
  /** Unique identifier for the check (e.g., 'mcp.duplicate-executables') */
  id: string;
  /** Human-readable name of the check */
  name: string;
  /** Description of what the check validates */
  description: string;
  /** The context type(s) this check applies to */
  appliesTo: T['type'] | T['type'][];
  /** Priority for ordering (lower runs first, default: 100) */
  priority?: number;
  /**
   * Run the validation check
   * @param context The validation context
   * @returns Array of issues found (empty array if check passes).
   *          Can return synchronously or as a Promise.
   */
  run(context: T): ValidationIssue[] | Promise<ValidationIssue[]>;
}

/**
 * Type guard for MCP config context.
 *
 * Useful for custom validation checks that need to handle both MCP and QNSC-MCP
 * contexts, or for consumers processing validation results programmatically.
 *
 * @example
 * ```typescript
 * function processContext(ctx: ValidationContext) {
 *   if (isMcpConfigContext(ctx)) {
 *     // ctx is now typed as McpConfigContext
 *     console.log(`Validating ${ctx.format} format config at ${ctx.filePath}`);
 *   }
 * }
 * ```
 */
export function isMcpConfigContext(ctx: ValidationContext): ctx is McpConfigContext {
  return ctx.type === 'mcp-config';
}

/**
 * Type guard for QNSC-MCP config context.
 *
 * Useful for custom validation checks that need to handle both MCP and QNSC-MCP
 * contexts, or for consumers processing validation results programmatically.
 *
 * @example
 * ```typescript
 * function processContext(ctx: ValidationContext) {
 *   if (isQnscMcpConfigContext(ctx)) {
 *     // ctx is now typed as QnscMcpConfigContext
 *     console.log(`Validating QNSC-MCP config${ctx.filePath ? ` at ${ctx.filePath}` : ''}`);
 *   }
 * }
 * ```
 */
export function isQnscMcpConfigContext(ctx: ValidationContext): ctx is QnscMcpConfigContext {
  return ctx.type === 'qnsc-mcp-config';
}
