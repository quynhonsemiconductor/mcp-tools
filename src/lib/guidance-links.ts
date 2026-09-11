/**
 * Shared guidance constants for user-facing messages.
 *
 * This module centralizes documentation URLs, support channels, and common
 * guidance text used across validation (doctor tool), error handling
 * (server startup errors), and tool signatures.
 *
 * Note: CLI commands are defined in services/validation/constants.ts
 */

/** Base URL for the MCP tools GitHub repository */
const REPO_BASE_URL = 'https://github.com/quynhonsemiconductor/mcp-tools';

/**
 * Documentation URLs for the MCP tools project.
 * Use these instead of hardcoding URLs to ensure consistency.
 */
export const DOCUMENTATION_URLS = {
  /** Repository home page (used in tool signatures) */
  REPOSITORY: REPO_BASE_URL,
  /** Main configuration documentation */
  CONFIGURATION: `${REPO_BASE_URL}?tab=readme-ov-file#%EF%B8%8F-configuration`,
  /** Troubleshooting guide */
  TROUBLESHOOTING: `${REPO_BASE_URL}#troubleshooting`,
  /** GitHub issues page */
  GITHUB_ISSUES: `${REPO_BASE_URL}/issues`,
  /** Latest releases download page */
  RELEASES: `${REPO_BASE_URL}/releases/latest`,
} as const;

/**
 * Support channels for getting help.
 *
 * Was a Slack channel, `#ai-mcp` on `qnsc.slack.com`, inherited from the upstream
 * project. That workspace is not ours — the URL was left as a literal
 * `TODO-update-channel` placeholder and the host answers 403 — so error messages were
 * directing people somewhere they could not go. GitHub Issues and Discussions exist on
 * the repository and need no extra setup.
 */
export const SUPPORT = {
  /** Where to report a problem with enough detail to reproduce it. */
  ISSUES: `${REPO_BASE_URL}/issues`,
  /** Where to ask a question that is not yet a bug report. */
  DISCUSSIONS: `${REPO_BASE_URL}/discussions`,
} as const;

/**
 * Common guidance text used across multiple error messages.
 * Only include text that is genuinely reused in multiple places.
 */
export const GUIDANCE = {
  /** Instruction to restart IDE - kept short so callers can append context */
  RESTART_IDE: 'Restart your IDE',
} as const;
