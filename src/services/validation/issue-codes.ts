/**
 * Machine-readable issue codes for validation results.
 *
 * These constants ensure consistency between checks that produce issues
 * and code that consumes them (e.g., recommendations in doctor.ts).
 */

import { CLI_COMMANDS } from './constants';
import { DOCUMENTATION_URLS } from '../../lib/guidance-links';

// MCP Config checks
export const MCP_ISSUE_CODES = {
  // File and parse errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  INVALID_JSON: 'INVALID_JSON',
  INVALID_YAML: 'INVALID_YAML',
  UNKNOWN_FORMAT: 'UNKNOWN_FORMAT',
  SCHEMA_VALIDATION_ERROR: 'SCHEMA_VALIDATION_ERROR',

  // Server structure
  NO_SERVERS_CONFIGURED: 'NO_SERVERS_CONFIGURED',
  INVALID_SERVER_NAME: 'INVALID_SERVER_NAME',
  SERVER_NAME_HAS_SPACES: 'SERVER_NAME_HAS_SPACES',
  SERVER_NAME_CONVENTION: 'SERVER_NAME_CONVENTION',

  // Executable validation
  EXECUTABLE_NOT_FOUND: 'EXECUTABLE_NOT_FOUND',
  EXECUTABLE_NOT_EXECUTABLE: 'EXECUTABLE_NOT_EXECUTABLE',
  ARG_FILE_NOT_FOUND: 'ARG_FILE_NOT_FOUND',
  DUPLICATE_EXECUTABLE: 'DUPLICATE_EXECUTABLE',

  // Environment variables
  MISSING_ENV_VAR: 'MISSING_ENV_VAR',
  PLACEHOLDER_ENV_VAR: 'PLACEHOLDER_ENV_VAR',
  HARDCODED_SECRET: 'HARDCODED_SECRET',
  ENV_VAR_EXPANSION_MISSING: 'ENV_VAR_EXPANSION_MISSING',
  ENV_VAR_EXPANSION_INFO: 'ENV_VAR_EXPANSION_INFO',
  ENV_VAR_UNSUPPORTED_SYNTAX: 'ENV_VAR_UNSUPPORTED_SYNTAX',

  // Registry/runtime
  CHECK_FAILED: 'CHECK_FAILED',
} as const;

// QNSC-MCP Config checks
export const QNSCMCP_ISSUE_CODES = {
  // Tool references
  INVALID_TOOL_REFERENCE: 'INVALID_TOOL_REFERENCE',
  INVALID_CATEGORY_REFERENCE: 'INVALID_CATEGORY_REFERENCE',
  NO_TOOLS_ENABLED: 'NO_TOOLS_ENABLED',
  CONFIG_LOAD_ERROR: 'CONFIG_LOAD_ERROR',
  VALIDATION_SKIPPED: 'VALIDATION_SKIPPED',

  // Architecture checks
  ARCHITECTURE_MISMATCH: 'ARCHITECTURE_MISMATCH',
  X64_ON_APPLE_SILICON: 'X64_ON_APPLE_SILICON',

  // Keyring/credential storage checks
  KEYRING_UNAVAILABLE: 'KEYRING_UNAVAILABLE',
  KEYRING_CORRUPTION: 'KEYRING_CORRUPTION',

  // TLS trust store checks
  TLS_TRUST_STORE_DISABLED: 'TLS_TRUST_STORE_DISABLED',

  // MCP references
  UNKNOWN_BUNDLED_MCP: 'UNKNOWN_BUNDLED_MCP',
  BUNDLED_MCP_MISSING_METADATA: 'BUNDLED_MCP_MISSING_METADATA',
  BUNDLED_MCP_MISSING_ENV_VAR: 'BUNDLED_MCP_MISSING_ENV_VAR',
  INVALID_METADATA_JSON: 'INVALID_METADATA_JSON',

  UNKNOWN_REMOTE_MCP: 'UNKNOWN_REMOTE_MCP',
  REMOTE_MCP_MISSING_ENV_VAR: 'REMOTE_MCP_MISSING_ENV_VAR',

  UNKNOWN_LOCAL_MCP: 'UNKNOWN_LOCAL_MCP',
  LOCAL_MCP_MISSING_ENV_VAR: 'LOCAL_MCP_MISSING_ENV_VAR',

  // Deprecated env vars
  DEPRECATED_ENV_VAR: 'DEPRECATED_ENV_VAR',

  // Deprecated config aliases
  DEPRECATED_CONFIG_ALIAS: 'DEPRECATED_CONFIG_ALIAS',
} as const;

/**
 * All issue codes combined for type checking
 */
export const ISSUE_CODES = {
  ...MCP_ISSUE_CODES,
  ...QNSCMCP_ISSUE_CODES,
} as const;

export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

/**
 * Type guard to check if a string is a valid issue code.
 * Useful for downstream tooling that consumes JSON output.
 */
export function isIssueCode(code: string): code is IssueCode {
  return Object.values(ISSUE_CODES).includes(code as IssueCode);
}

/**
 * Recommendations for each issue code.
 * Co-located with issue codes to ensure consistency and maintainability.
 *
 * Each recommendation is an array of strings that will be displayed as
 * multiple lines (first line is the title, subsequent lines are details).
 */
export const ISSUE_RECOMMENDATIONS: Partial<Record<IssueCode, string[]>> = {
  // MCP Config recommendations
  [MCP_ISSUE_CODES.EXECUTABLE_NOT_FOUND]: [
    '💡 Recommendation for missing executables:',
    '   Verify the path is correct or ensure the executable is installed and in your PATH',
  ],
  [MCP_ISSUE_CODES.DUPLICATE_EXECUTABLE]: [
    '💡 Recommendation for duplicate executables:',
    '   Use only one server entry per executable to avoid unexpected behavior',
  ],
  [MCP_ISSUE_CODES.MISSING_ENV_VAR]: [
    '💡 Recommendation for missing environment variables:',
    '   Add required environment variables to the "env" section of your server config',
  ],
  [MCP_ISSUE_CODES.HARDCODED_SECRET]: [
    '💡 Recommendation for hardcoded secrets:',
    '   Use environment variable references (e.g., from your shell profile) instead of',
    '   hardcoding secrets directly in configuration files',
  ],
  [MCP_ISSUE_CODES.EXECUTABLE_NOT_EXECUTABLE]: [
    '💡 Recommendation for non-executable files:',
    '   Run chmod +x on the file to add execute permissions',
  ],
  [MCP_ISSUE_CODES.ARG_FILE_NOT_FOUND]: [
    '💡 Recommendation for missing arg files:',
    '   Verify the file path is correct and the file exists',
  ],
  [MCP_ISSUE_CODES.SERVER_NAME_HAS_SPACES]: [
    '💡 Recommendation for server names with spaces:',
    '   Rename the server to use kebab-case (e.g., "my-server") without spaces',
  ],
  [MCP_ISSUE_CODES.SERVER_NAME_CONVENTION]: [
    '💡 Recommendation for server naming:',
    '   Use kebab-case for server names (e.g., "my-api-server")',
  ],
  [MCP_ISSUE_CODES.ENV_VAR_EXPANSION_MISSING]: [
    '💡 How to fix missing environment variables:',
    '   Option 1: Set the variable in your terminal before running:',
    '             export VARIABLE_NAME="your-value"',
    '   Option 2: Add it to your shell profile (~/.bashrc, ~/.zshrc) for persistence',
    '   Option 3: Provide a fallback in the config using ${VAR:-fallback} syntax',
  ],
  [MCP_ISSUE_CODES.ENV_VAR_UNSUPPORTED_SYNTAX]: [
    '💡 How to fix unsupported environment variable syntax:',
    '   Use the ${VAR} syntax for environment variable expansion.',
    '   Examples:',
    '     ${HOME}          - expands to home directory',
    '     ${API_KEY}       - expands to API_KEY value',
    '     ${VAR:-default}  - expands to VAR or "default" if unset',
  ],

  // QNSC-MCP Config recommendations
  [QNSCMCP_ISSUE_CODES.INVALID_TOOL_REFERENCE]: [
    '💡 Recommendation for invalid tool references:',
    `   Run "${CLI_COMMANDS.LIST}" to see available tools and categories`,
  ],
  [QNSCMCP_ISSUE_CODES.INVALID_CATEGORY_REFERENCE]: [
    '💡 Recommendation for invalid category references:',
    `   Run "${CLI_COMMANDS.LIST}" to see available tools and categories`,
  ],
  [QNSCMCP_ISSUE_CODES.UNKNOWN_BUNDLED_MCP]: [
    '💡 Recommendation for unknown bundled MCPs:',
    '   Check the bundled/ directory for available MCP servers',
  ],
  [QNSCMCP_ISSUE_CODES.NO_TOOLS_ENABLED]: [
    '💡 Recommendation for zero enabled tools:',
    '   Add tool IDs to the "include" list or categories to "includeCategories" in .qnscmcp.yaml',
  ],
  [QNSCMCP_ISSUE_CODES.CONFIG_LOAD_ERROR]: [
    '💡 Recommendation for config load errors:',
    '   Check your .qnscmcp.yaml file for syntax errors (invalid YAML)',
    '   Ensure the file exists and is readable',
  ],
  [QNSCMCP_ISSUE_CODES.UNKNOWN_REMOTE_MCP]: [
    '💡 Recommendation for unknown remote MCPs:',
    `   Run "${CLI_COMMANDS.LIST_REMOTE_MCPS}" to see available remote MCP server IDs`,
  ],
  [QNSCMCP_ISSUE_CODES.UNKNOWN_LOCAL_MCP]: [
    '💡 Recommendation for unknown local MCPs:',
    `   Run "${CLI_COMMANDS.LIST_LOCAL_MCPS}" to see available local MCP server IDs`,
  ],
  [QNSCMCP_ISSUE_CODES.BUNDLED_MCP_MISSING_ENV_VAR]: [
    '💡 Recommendation for missing MCP environment variables:',
    '   Set the required environment variables in your shell profile or .env file',
  ],
  [QNSCMCP_ISSUE_CODES.REMOTE_MCP_MISSING_ENV_VAR]: [
    '💡 Recommendation for missing MCP environment variables:',
    '   Set the required environment variables in your shell profile or .env file',
  ],
  [QNSCMCP_ISSUE_CODES.LOCAL_MCP_MISSING_ENV_VAR]: [
    '💡 Recommendation for missing MCP environment variables:',
    '   Set the required environment variables in your shell profile or .env file',
  ],
  [QNSCMCP_ISSUE_CODES.ARCHITECTURE_MISMATCH]: [
    '💡 Recommendation for architecture mismatch:',
    '   Download the binary that matches your system architecture for better performance',
    `   Download: ${DOCUMENTATION_URLS.RELEASES}`,
  ],
  [QNSCMCP_ISSUE_CODES.X64_ON_APPLE_SILICON]: [
    '💡 Recommendation for x64 binary on Apple Silicon:',
    '   Download the arm64 binary for native Apple Silicon performance',
    `   Download: ${DOCUMENTATION_URLS.RELEASES}`,
  ],
  [QNSCMCP_ISSUE_CODES.KEYRING_UNAVAILABLE]: [
    '💡 Recommendation for unavailable keyring:',
    '   Set authentication tokens via environment variables for persistent access',
    '   Example: export GITHUB_TOKEN="your-token-here"',
  ],
  [QNSCMCP_ISSUE_CODES.KEYRING_CORRUPTION]: [
    '💡 Recommendation for keyring corruption:',
    '   Delete the corrupted credential entries using the platform-specific commands shown above',
    '   After deletion, re-authenticate to create fresh credential entries',
    '   This issue commonly occurs after software version upgrades',
  ],
  [QNSCMCP_ISSUE_CODES.TLS_TRUST_STORE_DISABLED]: [
    '💡 Recommendation for TLS trust store:',
    '   Corporate SSL inspection (e.g. Zscaler) requires trusting the OS root CA store.',
    '   qnsc-mcp auto-sets NODE_USE_SYSTEM_CA=1 at startup; something appears to have overridden it.',
    '   Run `unset NODE_USE_SYSTEM_CA` (and `unset NODE_EXTRA_CA_CERTS` if pointing to a stale file) to restore defaults.',
  ],
  [QNSCMCP_ISSUE_CODES.DEPRECATED_CONFIG_ALIAS]: [
    '💡 Recommendation for deprecated config aliases:',
    '   Update your .qnscmcp.yaml to use the new key names directly',
    '   The old keys still work but may be removed in a future release',
  ],
  [QNSCMCP_ISSUE_CODES.DEPRECATED_ENV_VAR]: [
    '💡 Recommendation for deprecated environment variables:',
    '   Remove the variable from your shell profile (~/.bashrc, ~/.zshrc, etc.)',
    '   These variables are no longer used and can be safely deleted',
  ],
};
