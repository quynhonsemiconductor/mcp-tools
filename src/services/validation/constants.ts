/**
 * Shared constants for the validation system
 *
 * This module centralizes magic numbers and patterns used across validation checks
 * to make the system more maintainable and self-documenting.
 */

/**
 * Check priorities define the order in which validation checks run.
 * Lower numbers run first. Checks are grouped into logical tiers:
 *
 * - CRITICAL (5): Foundational checks that other checks depend on
 * - HIGH (10-15): Basic structural validation
 * - MEDIUM (20-35): Reference and path validation
 * - LOW (40-50): Environment and secret validation
 * - FINAL (100): Summary checks that run last
 *
 * Priorities are spaced in increments of 5 to allow inserting new checks
 * without renumbering existing ones.
 */
export const CHECK_PRIORITIES = {
  /** Run very early - checks that other checks depend on (e.g., no-servers) */
  CRITICAL: 5,

  /** Basic structural validation */
  SERVER_NAMES: 10,
  TOOL_REFERENCES: 10,
  CATEGORY_REFERENCES: 15,

  /** Path and reference validation */
  EXECUTABLE_PATHS: 20,
  BUNDLED_MCP_REFERENCES: 20,
  ARG_FILE_PATHS: 25,
  BUNDLED_MCP_ENV_VARS: 25,

  /** Duplicate and remote MCP validation */
  DUPLICATE_EXECUTABLES: 30,
  REMOTE_MCP_REFERENCES: 30,
  REMOTE_MCP_ENV_VARS: 35,

  /** Secret and environment validation */
  HARDCODED_SECRETS: 40,
  LOCAL_MCP_REFERENCES: 40,
  LOCAL_MCP_ENV_VARS: 45,
  ENV_VARS: 50,
  ENV_VAR_EXPANSION: 55,
  DEPRECATED_ENV_VARS: 60,
  DEPRECATED_CONFIG_ALIASES: 65,

  /** Summary checks that run after all others */
  FINAL: 100,
} as const;

/**
 * Default priority for checks that don't specify one.
 * Set to FINAL so unspecified checks run last and don't interfere
 * with the established priority order.
 */
export const DEFAULT_CHECK_PRIORITY = CHECK_PRIORITIES.FINAL;

/**
 * Shared regex patterns used across validation checks
 */
export const VALIDATION_PATTERNS = {
  /**
   * Pattern to detect Windows absolute paths (e.g., "C:\path\to\file", "D:/path")
   * Matches drive letter followed by colon and either forward slash or backslash.
   * Note: Windows accepts both forward slashes and backslashes as path separators.
   */
  WINDOWS_ABSOLUTE_PATH: /^[a-zA-Z]:[/\\]/,

  /**
   * Recommended server naming pattern: lowercase with hyphens (kebab-case)
   * e.g., "my-server", "api-gateway"
   */
  RECOMMENDED_SERVER_NAME: /^[a-z][a-z0-9-]*$/,

  /**
   * Common executable extensions to strip when normalizing command paths
   * for duplicate detection across platforms.
   */
  EXECUTABLE_EXTENSIONS: /\.(exe|cmd|bat|sh)$/i,
} as const;

/**
 * Command names whose positional args are NOT host filesystem paths.
 *
 * - Container runtimes (docker, podman, ...) take image references such as
 *   "mcp/sonarqube" or "docker.io/org/image:tag" plus in-container paths.
 * - Package runners (npx, bunx, uvx, ...) take package specifiers such as
 *   "@scope/package".
 *
 * All of these legitimately contain "/" and must not be validated against the
 * local filesystem, otherwise the arg file-path check reports false positives.
 *
 * Matched by command basename (case-insensitive), so absolute command paths
 * like "/usr/local/bin/docker" are handled too.
 */
export const NON_PATH_ARG_COMMANDS = new Set<string>([
  // Container runtimes
  'docker',
  'podman',
  'nerdctl',
  'finch',
  'container',
  // Package runners
  'npx',
  'bunx',
  'pnpm',
  'yarn',
  'uvx',
  'uv',
  'pipx',
]);

/**
 * Number of command arguments to include when determining executable uniqueness.
 * Including the first 2 args helps distinguish between different scripts
 * run by the same interpreter (e.g., node server1.js vs node server2.js).
 */
export const ARGS_FOR_EXECUTABLE_UNIQUENESS = 2;

/**
 * CLI command names used in recommendations.
 * Centralized to ensure consistency if command names change.
 */
export const CLI_COMMANDS = {
  /** Run diagnostics on configuration */
  DOCTOR: 'qnsc-mcp doctor',
  /** List available tools and categories */
  LIST: 'qnsc-mcp list',
  /** List available tools */
  LIST_TOOLS: 'qnsc-mcp list-tools',
  /** List available remote MCPs */
  LIST_REMOTE_MCPS: 'qnsc-mcp list-remote-mcps',
  /** List available local MCPs */
  LIST_LOCAL_MCPS: 'qnsc-mcp list-local-mcps',
} as const;

/**
 * Minimum length for a value to be considered a potential secret when
 * the environment variable name suggests it contains sensitive data.
 * This threshold helps avoid false positives for short configuration values
 * while still catching typical API keys and tokens which are usually 16+ chars.
 */
export const MIN_SECRET_LENGTH = 16;
