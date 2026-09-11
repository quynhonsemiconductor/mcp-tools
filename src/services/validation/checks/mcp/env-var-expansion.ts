/**
 * Environment variable expansion validation for MCP configs
 *
 * Claude Code supports environment variable expansion in .mcp.json files
 * using the syntax:
 * - ${VAR} - Expands to the value of environment variable VAR
 * - ${VAR:-default} - Expands to VAR if set, otherwise uses default
 *
 * Expansion is supported in these fields:
 * - command - The server executable path
 * - args - Command-line arguments
 * - env - Environment variables passed to the server
 * - url - For HTTP server types
 * - headers - For HTTP server authentication
 *
 * This check validates that referenced environment variables exist
 * (when no default is provided) and informs users about expansions
 * that will occur.
 *
 * @see https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcp-json
 */

import { CHECK_PRIORITIES } from '../../constants';
import { MCP_ISSUE_CODES } from '../../issue-codes';
import type {
  McpConfigContext,
  McpServerConfig,
  ValidationCheck,
  ValidationIssue,
} from '../../types';
import { forEachServer } from '../../utils';

/**
 * Extended server config that includes HTTP server fields.
 * The base McpServerConfig only includes command/args/env, but MCP configs
 * can also have HTTP servers with url and headers fields.
 */
interface ExtendedServerConfig extends McpServerConfig {
  /** URL for HTTP-based MCP servers */
  url?: string;
  /** HTTP headers for authentication */
  headers?: Record<string, string>;
}

/**
 * Pattern to match environment variable expansion syntax.
 * Matches:
 * - ${VAR} - simple expansion
 * - ${VAR:-default} - expansion with default value
 *
 * Does NOT match:
 * - ${env:VAR} - Copilot-specific PowerShell-style syntax (handled separately)
 *
 * Capture groups:
 * - group 1: variable name
 * - group 2: default value (including the :- prefix) or undefined
 *
 * Note: Default values containing '}' characters are not supported (e.g., ${VAR:-{"key":"value"}}).
 * This is an acceptable limitation as such values are rare in practice.
 */
const ENV_VAR_EXPANSION_PATTERN = /\$\{(?!env:)([A-Za-z_][A-Za-z0-9_]*)(?:(:-[^}]*))?\}/g;

/**
 * Pattern to match Copilot-specific ${env:VAR} syntax.
 * This syntax works in GitHub Copilot but NOT in other MCP clients.
 *
 * Matches: ${env:VAR}, ${env:USERPROFILE}, ${env:HOME}
 * Case-insensitive for the "env:" prefix.
 */
const COPILOT_ENV_PATTERN = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/gi;

/**
 * Pattern to match shell-style $VAR syntax (without braces).
 * This syntax works in GitHub Copilot but NOT in Claude Code.
 *
 * Matches: $VAR, $HOME, $API_KEY
 * Does NOT match:
 *   - ${VAR} (handled by ENV_VAR_EXPANSION_PATTERN)
 *   - $env:VAR (handled by POWERSHELL_VAR_PATTERN)
 *
 * Uses negative lookahead to avoid matching ${VAR} and $env: patterns.
 */
const SHELL_VAR_PATTERN = /\$(?!\{)(?!env:)([A-Za-z_][A-Za-z0-9_]*)/gi;

/**
 * Pattern to match Windows CMD-style %VAR% syntax.
 * This syntax does NOT work in any MCP client.
 *
 * Matches: %VAR%, %HOME%, %API_KEY%
 */
const WINDOWS_CMD_VAR_PATTERN = /%([A-Za-z_][A-Za-z0-9_]*)%/g;

/**
 * Pattern to match PowerShell-style $env:VAR syntax.
 * This syntax does NOT work in any MCP client.
 *
 * Matches: $env:VAR, $env:HOME, $env:API_KEY
 */
const POWERSHELL_VAR_PATTERN = /\$env:([A-Za-z_][A-Za-z0-9_]*)/gi;

/**
 * Information about an environment variable expansion found in config
 */
interface EnvVarExpansion {
  /** The full match (e.g., "${API_KEY}" or "${API_KEY:-default}") */
  match: string;
  /** The variable name (e.g., "API_KEY") */
  varName: string;
  /** The default value if provided (without the :- prefix), or undefined */
  defaultValue: string | undefined;
  /** Whether the variable is currently set in the environment */
  isSet: boolean;
  /** The field where the expansion was found */
  field: string;
}

/**
 * Type of unsupported environment variable syntax
 */
type UnsupportedSyntaxType = 'shell' | 'windows-cmd' | 'powershell' | 'copilot-env';

/**
 * Information about unsupported environment variable syntax found in config
 */
interface UnsupportedSyntax {
  /** The full match (e.g., "$VAR", "%VAR%", "$env:VAR") */
  match: string;
  /** The variable name */
  varName: string;
  /** The type of unsupported syntax */
  syntaxType: UnsupportedSyntaxType;
  /** The field where the syntax was found */
  field: string;
}

/**
 * Find all unsupported environment variable syntax patterns in a string value
 */
function findUnsupportedSyntax(value: string, field: string): UnsupportedSyntax[] {
  const unsupported: UnsupportedSyntax[] = [];

  // Check for shell-style $VAR (without braces)
  SHELL_VAR_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SHELL_VAR_PATTERN.exec(value)) !== null) {
    unsupported.push({
      match: match[0],
      varName: match[1],
      syntaxType: 'shell',
      field,
    });
  }

  // Check for Windows CMD-style %VAR%
  WINDOWS_CMD_VAR_PATTERN.lastIndex = 0;
  while ((match = WINDOWS_CMD_VAR_PATTERN.exec(value)) !== null) {
    unsupported.push({
      match: match[0],
      varName: match[1],
      syntaxType: 'windows-cmd',
      field,
    });
  }

  // Check for PowerShell-style $env:VAR
  POWERSHELL_VAR_PATTERN.lastIndex = 0;
  while ((match = POWERSHELL_VAR_PATTERN.exec(value)) !== null) {
    unsupported.push({
      match: match[0],
      varName: match[1],
      syntaxType: 'powershell',
      field,
    });
  }

  // Check for Copilot-specific ${env:VAR} syntax
  COPILOT_ENV_PATTERN.lastIndex = 0;
  while ((match = COPILOT_ENV_PATTERN.exec(value)) !== null) {
    unsupported.push({
      match: match[0],
      varName: match[1],
      syntaxType: 'copilot-env',
      field,
    });
  }

  return unsupported;
}

/**
 * Find all environment variable expansions in a string value
 */
function findExpansions(value: string, field: string): EnvVarExpansion[] {
  const expansions: EnvVarExpansion[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  ENV_VAR_EXPANSION_PATTERN.lastIndex = 0;

  while ((match = ENV_VAR_EXPANSION_PATTERN.exec(value)) !== null) {
    const varName = match[1];
    const defaultPart = match[2]; // e.g., ":-default" or undefined
    const defaultValue = defaultPart ? defaultPart.slice(2) : undefined; // Remove ":-" prefix

    expansions.push({
      match: match[0],
      varName,
      defaultValue,
      isSet: process.env[varName] !== undefined,
      field,
    });
  }

  return expansions;
}

/**
 * Check a server config for environment variable expansions
 */
function checkServerForExpansions(serverConfig: ExtendedServerConfig): EnvVarExpansion[] {
  const expansions: EnvVarExpansion[] = [];

  // Check command field
  if (serverConfig.command) {
    expansions.push(...findExpansions(serverConfig.command, 'command'));
  }

  // Check args array
  if (serverConfig.args) {
    for (const arg of serverConfig.args) {
      expansions.push(...findExpansions(arg, 'args'));
    }
  }

  // Check env object
  if (serverConfig.env) {
    for (const [key, value] of Object.entries(serverConfig.env)) {
      expansions.push(...findExpansions(value, `env.${key}`));
    }
  }

  // Check url field (for HTTP servers)
  if (serverConfig.url) {
    expansions.push(...findExpansions(serverConfig.url, 'url'));
  }

  // Check headers object (for HTTP servers)
  if (serverConfig.headers) {
    for (const [key, value] of Object.entries(serverConfig.headers)) {
      expansions.push(...findExpansions(value, `headers.${key}`));
    }
  }

  return expansions;
}

/**
 * Check a server config for unsupported environment variable syntax
 */
function checkServerForUnsupportedSyntax(serverConfig: ExtendedServerConfig): UnsupportedSyntax[] {
  const unsupported: UnsupportedSyntax[] = [];

  // Check command field
  if (serverConfig.command) {
    unsupported.push(...findUnsupportedSyntax(serverConfig.command, 'command'));
  }

  // Check args array
  if (serverConfig.args) {
    for (const arg of serverConfig.args) {
      unsupported.push(...findUnsupportedSyntax(arg, 'args'));
    }
  }

  // Check env object
  if (serverConfig.env) {
    for (const [key, value] of Object.entries(serverConfig.env)) {
      unsupported.push(...findUnsupportedSyntax(value, `env.${key}`));
    }
  }

  // Check url field (for HTTP servers)
  if (serverConfig.url) {
    unsupported.push(...findUnsupportedSyntax(serverConfig.url, 'url'));
  }

  // Check headers object (for HTTP servers)
  if (serverConfig.headers) {
    for (const [key, value] of Object.entries(serverConfig.headers)) {
      unsupported.push(...findUnsupportedSyntax(value, `headers.${key}`));
    }
  }

  return unsupported;
}

/**
 * Get a human-readable description of the unsupported syntax type
 */
function getUnsupportedSyntaxDescription(syntaxType: UnsupportedSyntaxType): {
  name: string;
  suggestion: string;
} {
  switch (syntaxType) {
    case 'shell':
      return {
        name: 'shell-style (without braces)',
        suggestion:
          'This syntax is supported by GitHub Copilot but will NOT be expanded by Claude Code. If you need Claude Code compatibility, use ${VAR} instead of $VAR.',
      };
    case 'windows-cmd':
      return {
        name: 'Windows CMD-style',
        suggestion:
          'This syntax is not supported by any MCP client and will be treated as a literal string. Use ${VAR} instead of %VAR%.',
      };
    case 'powershell':
      return {
        name: 'PowerShell-style',
        suggestion:
          'This syntax is not supported by any MCP client and will be treated as a literal string. Use ${VAR} instead of $env:VAR.',
      };
    case 'copilot-env':
      return {
        name: 'Copilot-specific PowerShell-style',
        suggestion:
          'This syntax is supported by GitHub Copilot but will NOT be expanded by other MCP clients. If you need cross-client compatibility, use ${VAR} instead of ${env:VAR}.',
      };
  }
}

/**
 * Check for environment variable expansion syntax in MCP configs.
 *
 * Validates:
 * - Required environment variables (${VAR} without default) are set
 * - Warns about unsupported syntax ($VAR, %VAR%, $env:VAR)
 * - Informs users about expansions that will occur (in verbose mode)
 */
export const envVarExpansionCheck = {
  // `satisfies` (not `: ValidationCheck<...>`) keeps run()'s inferred sync
  // return type (ValidationIssue[]) instead of widening it to the interface's
  // `ValidationIssue[] | Promise<...>`, which broke every direct-caller test
  // that does `.run(context).filter(...)` without awaiting.
  id: 'mcp.env-var-expansion',
  name: 'Environment variable expansion validation',
  description: 'Checks for ${VAR} syntax and validates referenced environment variables exist',
  appliesTo: 'mcp-config',
  priority: CHECK_PRIORITIES.ENV_VAR_EXPANSION,

  run(context: McpConfigContext): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const allExpansions: { serverName: string; expansion: EnvVarExpansion }[] = [];

    forEachServer(context, (serverName, serverConfig) => {
      const expansions = checkServerForExpansions(serverConfig as ExtendedServerConfig);

      for (const expansion of expansions) {
        allExpansions.push({ serverName, expansion });

        // If no default and variable is not set, that's a warning
        if (expansion.defaultValue === undefined && !expansion.isSet) {
          issues.push({
            severity: 'warning',
            code: MCP_ISSUE_CODES.ENV_VAR_EXPANSION_MISSING,
            message: `Missing environment variable: ${expansion.varName}`,
            details:
              `Your config references \${${expansion.varName}} in the "${expansion.field}" field, but this variable isn't set on your system. ` +
              `The MCP server may fail to start until you set it (e.g., run: export ${expansion.varName}="your-value").`,
            serverName,
          });
        }
      }

      // Check for unsupported syntax patterns
      const unsupportedSyntax = checkServerForUnsupportedSyntax(
        serverConfig as ExtendedServerConfig,
      );
      for (const syntax of unsupportedSyntax) {
        const { name, suggestion } = getUnsupportedSyntaxDescription(syntax.syntaxType);
        issues.push({
          severity: 'warning',
          code: MCP_ISSUE_CODES.ENV_VAR_UNSUPPORTED_SYNTAX,
          message: `Unsupported ${name} environment variable syntax: ${syntax.match}`,
          details:
            `Found "${syntax.match}" in the "${syntax.field}" field. ${suggestion} ` +
            `Change to: \${${syntax.varName}}`,
          serverName,
        });
      }
    });

    // Add info message about expansions that will occur (only if there are expansions)
    if (allExpansions.length > 0) {
      // Group expansions by variable name to avoid duplicate messages
      const uniqueVars = new Map<
        string,
        { isSet: boolean; hasDefault: boolean; servers: Set<string> }
      >();

      for (const { serverName, expansion } of allExpansions) {
        const existing = uniqueVars.get(expansion.varName);
        if (existing) {
          existing.servers.add(serverName);
          existing.hasDefault = existing.hasDefault || expansion.defaultValue !== undefined;
        } else {
          uniqueVars.set(expansion.varName, {
            isSet: expansion.isSet,
            hasDefault: expansion.defaultValue !== undefined,
            servers: new Set([serverName]),
          });
        }
      }

      // Create info messages for variables that will be expanded
      const willExpand: string[] = [];
      for (const [varName, info] of uniqueVars) {
        if (info.isSet) {
          willExpand.push(varName);
        } else if (info.hasDefault) {
          willExpand.push(`${varName} (using default)`);
        }
      }

      if (willExpand.length > 0) {
        issues.push({
          severity: 'info',
          code: MCP_ISSUE_CODES.ENV_VAR_EXPANSION_INFO,
          message: `Environment variable expansion will occur`,
          details: `The following variables will be expanded: ${willExpand.join(', ')}`,
        });
      }
    }

    return issues;
  },
} satisfies ValidationCheck<McpConfigContext>;
