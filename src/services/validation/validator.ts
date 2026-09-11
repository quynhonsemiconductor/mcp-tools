/**
 * Validator facade providing a clean API for config validation
 *
 * This module provides the same interface as the original McpConfigValidator
 * but uses the new check registry pattern internally.
 */

import * as fs from 'fs';
import yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { loadConfig } from '../../config';
import { logDebug } from '../logger';
import { checkRegistry, validateQnscMcpConfig, validateMcpConfig } from './check-registry';
import { registerAllChecks } from './checks';
import { MCP_ISSUE_CODES } from './issue-codes';
import type {
  QnscMcpConfigContext,
  McpConfigContext,
  ValidationIssue,
  ValidationOptions,
  ValidationResult,
} from './types';

/**
 * Check if a file path has a YAML extension
 */
export function isYamlFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.yaml' || ext === '.yml';
}

// Ensure checks are registered
registerAllChecks();

/**
 * Client type for MCP configuration files
 */
type McpClient = 'vscode' | 'claude-desktop' | 'cursor' | 'generic';

/**
 * Configuration path definition used for building platform-specific paths
 */
interface ConfigPathDef {
  /** Client type identifier */
  client: McpClient;
  /** Human-readable client name */
  clientName: string;
  /** Path components relative to platform base (macOS/Linux) or AppData (Windows) */
  pathParts: string[];
  /** For generic paths, use homedir as base instead of platform-specific Application Support */
  isGeneric?: boolean;
  /** Use current working directory as base */
  useCwd?: boolean;
}

/**
 * Known MCP client configuration paths.
 * These are the standard locations where MCP clients store their configuration.
 */
const MCP_CLIENT_PATHS: ConfigPathDef[] = [
  {
    client: 'vscode',
    clientName: 'VS Code (Copilot)',
    pathParts: ['Code', 'User', 'mcp.json'],
  },
  {
    client: 'vscode',
    clientName: 'VS Code (Cline)',
    pathParts: [
      'Code',
      'User',
      'globalStorage',
      'rooveterinaryinc.roo-cline',
      'settings',
      'mcp.json',
    ],
  },
  {
    client: 'vscode',
    clientName: 'VS Code (Claude)',
    pathParts: [
      'Code',
      'User',
      'globalStorage',
      'anthropics.claude-code',
      'settings',
      'cline_mcp_settings.json',
    ],
  },
  {
    client: 'claude-desktop',
    clientName: 'Claude Desktop',
    pathParts: ['Claude', 'claude_desktop_config.json'],
  },
  {
    client: 'cursor',
    clientName: 'Cursor',
    pathParts: ['Cursor', 'User', 'globalStorage', 'cursor.mcp', 'mcp.json'],
  },
  {
    client: 'generic',
    clientName: 'Home directory',
    pathParts: ['.mcp.json'],
    isGeneric: true,
  },
  {
    client: 'generic',
    clientName: 'Home directory',
    pathParts: ['.claude.json'],
    isGeneric: true,
  },
  {
    client: 'generic',
    clientName: 'Current directory',
    pathParts: ['mcp.json'],
    useCwd: true,
  },
  {
    client: 'generic',
    clientName: 'Current directory',
    pathParts: ['.mcp.json'],
    useCwd: true,
  },
];

/**
 * Get platform-specific base path for application data
 */
function getPlatformAppDataBase(homedir: string, platform: string): string {
  switch (platform) {
    case 'darwin':
      return path.join(homedir, 'Library', 'Application Support');
    case 'win32':
      return path.join(homedir, 'AppData', 'Roaming');
    default: // linux and others
      return path.join(homedir, '.config');
  }
}

/**
 * Build full path for a config path definition
 */
function buildConfigPath(def: ConfigPathDef, homedir: string, platform: string): string {
  if (def.useCwd) {
    return path.join(process.cwd(), ...def.pathParts);
  }
  if (def.isGeneric) {
    return path.join(homedir, ...def.pathParts);
  }

  // Handle Claude Desktop's different path on Linux (lowercase 'claude')
  let pathParts = [...def.pathParts];
  if (def.client === 'claude-desktop' && platform === 'linux') {
    pathParts = ['claude', 'claude_desktop_config.json'];
  }

  const appDataBase = getPlatformAppDataBase(homedir, platform);
  return path.join(appDataBase, ...pathParts);
}

/**
 * Result of building all config paths
 */
interface ConfigPathInfo {
  /** Full resolved path */
  path: string;
  /** Client type */
  client: McpClient;
  /** Human-readable name */
  clientName: string;
  /** Original path definition */
  def: ConfigPathDef;
}

/**
 * Build all config paths with their metadata.
 * This is the single source of truth for config path generation.
 */
function buildAllConfigPaths(): ConfigPathInfo[] {
  const homedir = os.homedir();
  const platform = os.platform();

  return MCP_CLIENT_PATHS.map((def) => ({
    path: buildConfigPath(def, homedir, platform),
    client: def.client,
    clientName: def.clientName,
    def,
  }));
}

/**
 * Information about an MCP configuration file
 */
export interface McpConfigInfo {
  path: string;
  client: 'vscode' | 'claude-desktop' | 'cursor' | 'generic';
  clientName: string;
}

/**
 * Schema for MCP server configuration
 */
const McpServerSchema = z
  .object({
    type: z.enum(['stdio', 'httpStream']).optional(),
    command: z.string().min(1, 'Command cannot be empty'),
    args: z.array(z.string().min(1, 'Args cannot contain empty strings')).optional(),
    env: z
      .record(z.string(), z.string().min(1, 'Environment variable values cannot be empty'))
      .optional(),
  })
  .passthrough();

const McpConfigSchema = z
  .object({
    servers: z.record(z.string(), McpServerSchema),
  })
  .passthrough();

const ClaudeDesktopConfigSchema = z
  .object({
    mcpServers: z.record(z.string(), McpServerSchema),
  })
  .passthrough();

/**
 * Main validator class
 */
export class ConfigValidator {
  /**
   * Validate an MCP configuration file.
   *
   * Note: Uses synchronous fs operations for file reading. While the method
   * signature is async (for compatibility with the check registry's async
   * runChecks), the initial file operations are sync for simplicity and
   * compatibility with existing test mocks.
   */
  static async validateConfigFile(
    filePath: string,
    options: ValidationOptions = {},
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const checksPerformed: string[] = [];

    // Check file existence
    checksPerformed.push('File existence check');
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: MCP_ISSUE_CODES.FILE_NOT_FOUND,
            message: `Configuration file not found: ${filePath}`,
            details: 'The specified configuration file does not exist.',
          },
        ],
        serverCount: 0,
        ...(options.verbose && { checksPerformed }),
      };
    }

    // Read and parse JSON
    checksPerformed.push('JSON syntax validation');
    let config: Record<string, unknown>;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      config = JSON.parse(content);
    } catch (error) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: MCP_ISSUE_CODES.INVALID_JSON,
            message: 'Invalid JSON syntax',
            details: error instanceof Error ? error.message : 'Unknown parse error',
          },
        ],
        serverCount: 0,
        ...(options.verbose && { checksPerformed }),
      };
    }

    // Detect format and validate schema
    checksPerformed.push('Schema validation');
    let format: 'servers' | 'mcpServers';

    if ('servers' in config) {
      format = 'servers';
      const schemaResult = McpConfigSchema.safeParse(config);
      if (!schemaResult.success) {
        for (const error of schemaResult.error.issues) {
          issues.push({
            severity: 'error',
            code: MCP_ISSUE_CODES.SCHEMA_VALIDATION_ERROR,
            message: `Schema error at ${error.path.join('.')}: ${error.message}`,
          });
        }
      }
    } else if ('mcpServers' in config) {
      format = 'mcpServers';
      const schemaResult = ClaudeDesktopConfigSchema.safeParse(config);
      if (!schemaResult.success) {
        for (const error of schemaResult.error.issues) {
          issues.push({
            severity: 'error',
            code: MCP_ISSUE_CODES.SCHEMA_VALIDATION_ERROR,
            message: `Schema error at ${error.path.join('.')}: ${error.message}`,
          });
        }
      }
    } else {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: MCP_ISSUE_CODES.UNKNOWN_FORMAT,
            message: 'Configuration must have either "servers" or "mcpServers" key',
            details:
              'VS Code/Cline uses "servers", Claude Desktop uses "mcpServers". Neither was found.',
          },
        ],
        serverCount: 0,
        ...(options.verbose && { checksPerformed }),
      };
    }

    // If schema validation failed, return early
    if (issues.some((i) => i.severity === 'error')) {
      const servers = (config.servers || config.mcpServers || {}) as Record<string, unknown>;
      return {
        valid: false,
        issues,
        serverCount: Object.keys(servers).length,
        ...(options.verbose && { checksPerformed }),
      };
    }

    // Create context and run checks
    const context: McpConfigContext = {
      type: 'mcp-config',
      config,
      filePath,
      format,
    };

    const checkResult = await validateMcpConfig(context, options);

    // Merge results
    issues.push(...checkResult.issues);
    if (checkResult.checksPerformed) {
      checksPerformed.push(...checkResult.checksPerformed);
    }

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      serverCount: checkResult.serverCount,
      ...(options.verbose && { checksPerformed }),
    };
  }

  /**
   * Validate the QNSC-MCP configuration (.qnscmcp.yaml)
   */
  static async validateQnscMcpConfig(options: ValidationOptions = {}): Promise<ValidationResult> {
    const checksPerformed: string[] = [];
    const issues: ValidationIssue[] = [];

    // Try to load config
    checksPerformed.push('Configuration loading');
    let config: Record<string, unknown>;
    let configPath: string | undefined;

    try {
      const loadedConfig = loadConfig();
      config = loadedConfig as unknown as Record<string, unknown>;
      configPath = loadedConfig.source;
    } catch (error) {
      // If config fails to load, use empty config
      logDebug(
        `Failed to load QNSC-MCP config: ${error instanceof Error ? error.message : String(error)}`,
      );
      config = {};
    }

    // Create context and run checks
    const context: QnscMcpConfigContext = {
      type: 'qnsc-mcp-config',
      config,
      filePath: configPath,
    };

    const checkResult = await validateQnscMcpConfig(context, options);

    // Merge results
    issues.push(...checkResult.issues);
    if (checkResult.checksPerformed) {
      checksPerformed.push(...checkResult.checksPerformed);
    }

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      configPath,
      ...(options.verbose && { checksPerformed }),
    };
  }

  /**
   * Find all MCP configuration files.
   * Note: Uses synchronous fs.existsSync for simplicity since this is a quick
   * file existence check and is typically called once at startup.
   */
  static findAllMcpConfigs(): McpConfigInfo[] {
    const configs: McpConfigInfo[] = [];
    const allPaths = buildAllConfigPaths();

    for (const info of allPaths) {
      if (fs.existsSync(info.path)) {
        // Avoid duplicates (same path from different definitions)
        if (!configs.some((c) => c.path === info.path)) {
          configs.push({
            path: info.path,
            client: info.client,
            clientName: info.clientName,
          });
        }
      }
    }

    return configs;
  }

  /**
   * Get platform-specific config paths with examples (for display when no configs found)
   */
  static getPlatformSpecificPaths(): { path: string; description: string }[] {
    const platform = os.platform();
    const allPaths = buildAllConfigPaths();
    const seenDisplayPaths = new Set<string>();
    const seenCategories = new Set<string>();
    const paths: { path: string; description: string }[] = [];

    for (const info of allPaths) {
      // For display, skip duplicate generic paths (only show one example per category)
      if (info.def.isGeneric && seenCategories.has(info.clientName)) {
        continue;
      }
      if (info.def.useCwd && seenCategories.has(info.clientName)) {
        continue;
      }

      // For cwd paths in display, show relative format instead of absolute
      const displayPath = info.def.useCwd
        ? platform === 'win32'
          ? '.\\mcp.json'
          : './mcp.json'
        : info.path;

      if (!seenDisplayPaths.has(displayPath)) {
        seenDisplayPaths.add(displayPath);
        seenCategories.add(info.clientName);
        paths.push({
          path: displayPath,
          description: info.clientName,
        });
      }
    }

    return paths;
  }

  /**
   * Validate a specific QNSC-MCP YAML configuration file at the given path.
   *
   * Unlike validateQnscMcpConfig() which auto-discovers the config via loadConfig(),
   * this method reads and validates a specific YAML file provided by the user
   * (e.g., via `doctor --path ~/.qnscmcp/config.yaml`).
   */
  static async validateQnscMcpConfigFile(
    filePath: string,
    options: ValidationOptions = {},
  ): Promise<ValidationResult> {
    const checksPerformed: string[] = [];
    const issues: ValidationIssue[] = [];

    // Check file existence
    checksPerformed.push('File existence check');
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: MCP_ISSUE_CODES.FILE_NOT_FOUND,
            message: `Configuration file not found: ${filePath}`,
            details: 'The specified configuration file does not exist.',
          },
        ],
        configPath: filePath,
        ...(options.verbose && { checksPerformed }),
      };
    }

    // Read file content
    checksPerformed.push('YAML syntax validation');
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: MCP_ISSUE_CODES.FILE_NOT_FOUND,
            message: `Failed to read configuration file: ${filePath}`,
            details: error instanceof Error ? error.message : 'Unknown read error',
          },
        ],
        configPath: filePath,
        ...(options.verbose && { checksPerformed }),
      };
    }

    // Parse YAML
    let config: Record<string, unknown>;
    try {
      const parsed = yaml.load(content);
      if (
        parsed === null ||
        parsed === undefined ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        return {
          valid: false,
          issues: [
            {
              severity: 'error',
              code: MCP_ISSUE_CODES.INVALID_YAML,
              message: 'Invalid YAML content',
              details: 'The file does not contain a valid YAML object.',
            },
          ],
          configPath: filePath,
          ...(options.verbose && { checksPerformed }),
        };
      }
      config = parsed as Record<string, unknown>;
    } catch (error) {
      return {
        valid: false,
        issues: [
          {
            severity: 'error',
            code: MCP_ISSUE_CODES.INVALID_YAML,
            message: 'Invalid YAML syntax',
            details: error instanceof Error ? error.message : 'Unknown parse error',
          },
        ],
        configPath: filePath,
        ...(options.verbose && { checksPerformed }),
      };
    }

    // Create context and run QNSC-MCP checks
    const context: QnscMcpConfigContext = {
      type: 'qnsc-mcp-config',
      config,
      filePath,
    };

    const checkResult = await validateQnscMcpConfig(context, options);

    issues.push(...checkResult.issues);
    if (checkResult.checksPerformed) {
      checksPerformed.push(...checkResult.checksPerformed);
    }

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      issues,
      configPath: filePath,
      ...(options.verbose && { checksPerformed }),
    };
  }

  /**
   * Get the check registry (for testing/introspection)
   */
  static getCheckRegistry() {
    return checkRegistry;
  }
}
