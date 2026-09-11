/**
 * Hardcoded secrets detection for MCP configs
 */

import { CHECK_PRIORITIES, MIN_SECRET_LENGTH, VALIDATION_PATTERNS } from '../../constants';
import { MCP_ISSUE_CODES } from '../../issue-codes';
import type { McpConfigContext, ValidationCheck, ValidationIssue } from '../../types';
import { forEachServer } from '../../utils';

/**
 * File paths and identifiers for Claude-specific configurations that legitimately
 * require hardcoded API keys. These are exempt from hardcoded secret warnings.
 */
const CLAUDE_DESKTOP_CONFIG_FILE = 'claude_desktop_config.json';
const VSCODE_CLAUDE_SETTINGS_FILE = 'cline_mcp_settings.json';
const VSCODE_CLAUDE_EXTENSION_PATH = 'anthropics.claude-code';
const CLAUDE_SERVER_NAME = 'claude';
const ANTHROPIC_API_KEY_NAME = 'ANTHROPIC_API_KEY';

// Patterns that suggest a hardcoded secret
const SECRET_PATTERNS = [
  /^[a-f0-9]{32,}$/i, // Hex strings (API keys, tokens)
  /^[A-Za-z0-9+/]{40,}={0,2}$/, // Base64 strings
  /^sk-[a-zA-Z0-9]{20,}$/, // OpenAI-style keys
  /^sk-ant-[a-zA-Z0-9-_]{90,}$/, // Anthropic API keys
  /^ghp_[a-zA-Z0-9]{36}$/, // GitHub personal access tokens
  /^gho_[a-zA-Z0-9]{36}$/, // GitHub OAuth tokens
  /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/, // GitHub fine-grained PATs
  /^xox[baprs]-[a-zA-Z0-9-]{10,}$/, // Slack tokens
  /^AIza[0-9A-Za-z-_]{35}$/, // Google API keys
  /^ya29\.[0-9A-Za-z-_]+$/, // Google OAuth tokens
  /^eyJ[a-zA-Z0-9-_]+\.eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+$/, // JWT tokens
  /^AKIA[0-9A-Z]{16}$/, // AWS access key IDs
  /^[0-9a-zA-Z/+]{40}$/, // AWS secret access keys
  /^npm_[a-zA-Z0-9]{36}$/, // npm tokens
  /^sk_live_[a-zA-Z0-9]{24}$/, // Stripe live secret keys
  /^sk_test_[a-zA-Z0-9]{24}$/, // Stripe test secret keys
  /^rk_live_[a-zA-Z0-9]{24}$/, // Stripe restricted keys
  /^pk_live_[a-zA-Z0-9]{24}$/, // Stripe live publishable keys
  /^SK[a-f0-9]{32}$/, // Twilio API keys
  /^AC[a-f0-9]{32}$/, // Twilio Account SIDs
  /^SG\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+$/, // SendGrid API keys
  /^[a-zA-Z0-9]{24}_[a-zA-Z0-9]{64}$/, // Vercel tokens
  /^cf_[a-zA-Z0-9_-]{37,}$/, // Cloudflare API tokens
];

// Environment variable names that typically contain secrets
const SENSITIVE_ENV_NAMES = [
  /api[_-]?key/i,
  /api[_-]?secret/i,
  /api[_-]?token/i,
  /access[_-]?key/i, // Matches ACCESS_KEY, AWS_ACCESS_KEY_ID, etc.
  /access[_-]?token/i,
  /auth[_-]?token/i,
  /bearer[_-]?token/i,
  /client[_-]?secret/i,
  /password/i,
  /private[_-]?key/i,
  /secret/i,
  /token/i,
  /credential/i,
];

/**
 * Check if the configuration is a Claude-specific config that legitimately
 * requires hardcoded Anthropic API keys.
 *
 * These configs are exempt from hardcoded secret warnings for ANTHROPIC_API_KEY:
 * - Claude Desktop: claude_desktop_config.json with mcpServers format and server named "claude"
 * - VS Code Claude extension: cline_mcp_settings.json or anthropics.claude-code paths
 */
function isClaudeExemptConfig(
  serverName: string,
  format: 'servers' | 'mcpServers',
  filePath: string,
  envName: string,
): boolean {
  if (envName !== ANTHROPIC_API_KEY_NAME) {
    return false;
  }

  const isClaudeDesktop =
    format === 'mcpServers' &&
    serverName === CLAUDE_SERVER_NAME &&
    filePath.includes(CLAUDE_DESKTOP_CONFIG_FILE);

  const isVSCodeClaude =
    filePath.includes(VSCODE_CLAUDE_SETTINGS_FILE) ||
    filePath.includes(VSCODE_CLAUDE_EXTENSION_PATH);

  return isClaudeDesktop || isVSCodeClaude;
}

/**
 * Check if a value looks like a hardcoded secret
 *
 * @param value - The environment variable value to check
 * @param envName - The environment variable name
 * @param serverName - The server name (used for Claude-related exceptions)
 * @param format - The config format ('servers' or 'mcpServers')
 * @param filePath - The file path (used to detect Claude-specific configs)
 * @returns true if the value appears to be a hardcoded secret
 */
function looksLikeSecret(
  value: string,
  envName: string,
  serverName: string,
  format: 'servers' | 'mcpServers',
  filePath: string,
): boolean {
  // Check if the env name suggests it's a secret
  const isSensitiveName = SENSITIVE_ENV_NAMES.some((pattern) => pattern.test(envName));

  if (!isSensitiveName) {
    return false;
  }

  // Exception: Claude-related configurations legitimately require hardcoded Anthropic API keys
  if (isClaudeExemptConfig(serverName, format, filePath, envName)) {
    return false;
  }

  // Skip environment variable references
  if (value.startsWith('$') || value.includes('${')) {
    return false;
  }

  // Skip obviously non-secret values
  if (
    value === '' ||
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    value === 'undefined' ||
    /^\d+$/.test(value)
  ) {
    return false;
  }

  // Check against secret patterns
  if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
    return true;
  }

  // For sensitive env names, flag values that look like they could be secrets
  // (non-trivial strings that don't look like paths or URLs)
  if (isSensitiveName && value.length >= MIN_SECRET_LENGTH) {
    // Check for Unix absolute paths or Windows absolute paths (any drive letter)
    const looksLikePath =
      value.startsWith('/') || VALIDATION_PATTERNS.WINDOWS_ABSOLUTE_PATH.test(value);
    const looksLikeUrl = value.startsWith('http://') || value.startsWith('https://');

    if (!looksLikePath && !looksLikeUrl) {
      return true;
    }
  }

  return false;
}

/**
 * Check for hardcoded secrets in environment variables
 */
export const hardcodedSecretsCheck = {
  id: 'mcp.hardcoded-secrets',
  name: 'Hardcoded secrets detection',
  description: 'Detects potentially hardcoded secrets in environment variables',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.HARDCODED_SECRETS,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    forEachServer(context, (serverName, serverConfig) => {
      if (!serverConfig.env || typeof serverConfig.env !== 'object') return;

      for (const [envName, envValue] of Object.entries(serverConfig.env)) {
        if (typeof envValue !== 'string') continue;

        if (looksLikeSecret(envValue, envName, serverName, context.format, context.filePath)) {
          issues.push({
            severity: 'warning',
            code: MCP_ISSUE_CODES.HARDCODED_SECRET,
            message: `Potential hardcoded secret in "${envName}"`,
            details:
              'Consider using environment variable references instead of hardcoding secrets. ' +
              'Use ${ENV_VAR} syntax or reference from your shell profile.',
            serverName,
          });
        }
      }
    });

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;
