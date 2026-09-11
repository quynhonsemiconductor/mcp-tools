/**
 * mcp-config-loader.ts - Loader for MCP server configurations
 *
 * This module provides functionality for loading and validating MCP configuration files.
 */
import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { logIf } from '../../utils';
import { logError } from '../../services/logger';
import { CompanionConfig, EnvVarConfig, MCPConfig, MCPConfigResult } from '../types';
import { GitRepoSource } from '../types/bundle';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<MCPConfig> = {
  build: {
    enabled: false,
  },
  security: {
    allowNetwork: false,
    allowFileSystem: false,
  },
};

/**
 * Loosely-typed shape of a parsed (but not yet validated) MCP config YAML
 * document. Fields mirror MCPConfig/BuildConfig/etc. but stay optional and
 * `unknown` wherever `validateConfig` below runs its own runtime shape check
 * (Array.isArray + typeof) before trusting the value — the interface itself
 * performs no validation, it only replaces the previous `any` so property
 * access is type-checked instead of unsafe.
 */
interface RawSourceConfig {
  repository?: string;
  ref?: string;
  entrypoint?: string;
  workingDir?: string;
}

interface RawBuildConfig {
  enabled?: boolean;
  command?: string;
  args?: unknown;
  startFunction?: string;
  external?: string[];
}

interface RawSecurityConfig {
  allowNetwork?: boolean;
  networkAllowlist?: string[];
  allowFileSystem?: boolean;
  allowedPaths?: string[];
}

interface RawCompanionConfig {
  name?: string;
  description?: string;
  workingDir?: string;
  entrypoint?: string;
  staticFiles?: unknown;
  build?: RawBuildConfig;
}

interface RawEnvVarConfig {
  name?: string;
  description?: string;
  required?: boolean;
  default?: string;
  mock?: string;
}

interface RawMCPConfig {
  name?: string;
  description?: string;
  source?: RawSourceConfig;
  build?: RawBuildConfig;
  security?: RawSecurityConfig;
  staticFiles?: unknown;
  companions?: RawCompanionConfig[];
  envVars?: RawEnvVarConfig[];
}

/**
 * Configuration validation error
 */
export class MCPConfigError extends Error {
  public readonly filePath: string;

  /**
   * Creates a new configuration error
   * @param message Error message
   * @param filePath Configuration file path
   */
  constructor(message: string, filePath: string) {
    super(message);
    this.name = 'MCPConfigError';
    this.filePath = filePath;
  }
}

/**
 * Loader for MCP server configurations
 */
export class MCPConfigLoader {
  private readonly configDir: string;
  private readonly verbose: boolean;

  /**
   * Creates a new MCP configuration loader
   * @param configDir Directory containing configuration files
   * @param verbose Whether to log verbose output
   */
  constructor(configDir: string, verbose: boolean = false) {
    this.configDir = configDir;
    this.verbose = verbose;
  }

  /**
   * Find all YAML files recursively in a directory
   * @param dir Directory to search
   * @returns Array of paths to YAML files
   */
  private findYamlFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively search subdirectories
        results.push(...this.findYamlFiles(entryPath));
      } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        // Add YAML files
        results.push(entryPath);
      }
    }

    return results;
  }

  /**
   * Loads all MCP configurations from the config directory
   * @returns Array of MCP configurations
   */
  public async loadAllConfigs(): Promise<MCPConfigResult[]> {
    // Create the directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      logIf(`Creating config directory: ${this.configDir}`, this.verbose);
      fs.mkdirSync(this.configDir, { recursive: true });
      return [];
    }

    // Find all YAML files recursively
    const yamlPaths = this.findYamlFiles(this.configDir);

    logIf(
      `Found ${yamlPaths.length} configuration files in ${this.configDir} and subdirectories`,
      this.verbose,
    );

    const configs: MCPConfigResult[] = [];

    // Load each file
    for (const filePath of yamlPaths) {
      try {
        const config = await this.loadConfig(filePath);
        const dirName = path.basename(path.dirname(filePath));
        const fileName = path.basename(filePath, path.extname(filePath));
        const defaultName = fileName === 'server' ? dirName : fileName;

        configs.push({
          config,
          filePath,
          fileName: defaultName,
        });

        logIf(
          `🤩 Loaded configuration from ${filePath}: ${config.name || defaultName}`,
          this.verbose,
        );
      } catch (error) {
        if (error instanceof MCPConfigError) {
          logError(`Error loading config file ${filePath}: ${error.message}`);
        } else {
          logError(`Error loading config file ${filePath}:`, error);
        }
      }
    }

    return configs;
  }

  /**
   * Loads a single MCP configuration from a file
   * @param filePath Path to the configuration file
   * @returns MCP configuration
   * @throws MCPConfigError If the configuration is invalid
   */
  public loadConfig(filePath: string): Promise<MCPConfig> {
    // No `await` needed: reading/parsing/validating are all synchronous, but
    // the return type stays Promise<MCPConfig> because subclasses (see
    // mcp-config-loader.test.ts's TestMCPConfigLoader) override this as an
    // `async` method, which requires the base signature to match.
    try {
      // Read the file
      const content = fs.readFileSync(filePath, 'utf8');

      // Parse YAML
      const parsedConfig: unknown = yaml.load(content);

      // Validate and normalize
      return Promise.resolve(this.validateConfig(parsedConfig, filePath));
    } catch (error) {
      if (error instanceof MCPConfigError) {
        return Promise.reject(error);
      }
      return Promise.reject(
        new MCPConfigError(
          `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
          filePath,
        ),
      );
    }
  }

  /**
   * Validates an MCP configuration
   * @param config Configuration to validate
   * @param filePath Configuration file path
   * @returns Validated configuration
   * @throws MCPConfigError If the configuration is invalid
   */
  protected validateConfig(config: unknown, filePath: string): MCPConfig {
    if (!config || typeof config !== 'object') {
      throw new MCPConfigError('Configuration is empty', filePath);
    }
    const raw = config as RawMCPConfig;

    // Validate source section
    if (!raw.source) {
      throw new MCPConfigError('Missing required "source" section', filePath);
    }

    if (!raw.source.repository) {
      throw new MCPConfigError('Missing required "source.repository" field', filePath);
    }

    if (!raw.source.ref) {
      throw new MCPConfigError('Missing required "source.ref" field', filePath);
    }

    // Validate build.args if present
    if (raw.build?.args) {
      if (!Array.isArray(raw.build.args)) {
        throw new MCPConfigError('"build.args" must be an array of strings', filePath);
      }

      // Validate each arg is a string
      for (const arg of raw.build.args) {
        if (typeof arg !== 'string') {
          throw new MCPConfigError('Each item in "build.args" must be a string', filePath);
        }
      }
    }

    // Validate staticFiles if present
    let staticFiles: string[] | undefined = undefined;
    if (raw.staticFiles) {
      if (!Array.isArray(raw.staticFiles)) {
        throw new MCPConfigError('"staticFiles" must be an array of strings', filePath);
      }

      // Validate each entry is a string
      for (const file of raw.staticFiles) {
        if (typeof file !== 'string') {
          throw new MCPConfigError('Each entry in "staticFiles" must be a string', filePath);
        }
      }

      staticFiles = raw.staticFiles as string[];
    }

    // Validate companions if present
    let companions: CompanionConfig[] | undefined = undefined;
    if (raw.companions) {
      if (!Array.isArray(raw.companions)) {
        throw new MCPConfigError('"companions" must be an array', filePath);
      }

      companions = [];
      for (const companion of raw.companions) {
        if (!companion.name) {
          throw new MCPConfigError('Each companion must have a "name" property', filePath);
        }
        if (!companion.workingDir) {
          throw new MCPConfigError('Each companion must have a "workingDir" property', filePath);
        }
        if (!companion.entrypoint) {
          throw new MCPConfigError('Each companion must have an "entrypoint" property', filePath);
        }

        // Validate companion staticFiles if present
        let companionStaticFiles: string[] | undefined = undefined;
        if (companion.staticFiles) {
          if (!Array.isArray(companion.staticFiles)) {
            throw new MCPConfigError(
              `Companion "${companion.name}": "staticFiles" must be an array of strings`,
              filePath,
            );
          }

          // Validate each entry is a string
          for (const file of companion.staticFiles) {
            if (typeof file !== 'string') {
              throw new MCPConfigError(
                `Companion "${companion.name}": Each entry in "staticFiles" must be a string`,
                filePath,
              );
            }
          }

          companionStaticFiles = companion.staticFiles as string[];
        }

        // Add normalized companion config
        companions.push({
          name: companion.name,
          description: companion.description,
          workingDir: companion.workingDir,
          entrypoint: companion.entrypoint,
          staticFiles: companionStaticFiles,
          build: companion.build
            ? {
                enabled: companion.build.enabled ?? true,
                command: companion.build.command,
                args: companion.build.args as string[] | undefined,
                startFunction: companion.build.startFunction,
              }
            : undefined,
        });
      }
    }

    // Validate envVars if present
    let envVars: EnvVarConfig[] | undefined = undefined;
    if (raw.envVars) {
      if (!Array.isArray(raw.envVars)) {
        throw new MCPConfigError(
          '"envVars" must be an array of environment variable configurations',
          filePath,
        );
      }

      // Validate each environment variable entry
      envVars = [];
      for (const envVar of raw.envVars) {
        if (!envVar.name) {
          throw new MCPConfigError(
            'Each environment variable must have a "name" property',
            filePath,
          );
        }

        // Add normalized environment variable
        envVars.push({
          name: envVar.name,
          description: envVar.description,
          required: envVar.required ?? false,
          default: envVar.default,
          mock: envVar.mock,
        });
      }
    }

    // Create normalized configuration with defaults
    const normalizedConfig: MCPConfig = {
      name: raw.name,
      description: raw.description,
      source: {
        repository: raw.source.repository,
        ref: raw.source.ref,
        entrypoint: raw.source.entrypoint,
        workingDir: raw.source.workingDir,
      },
      build: {
        enabled: raw.build?.enabled ?? DEFAULT_CONFIG.build?.enabled ?? true,
        command: raw.build?.command,
        args: raw.build?.args as string[] | undefined,
        startFunction: raw.build?.startFunction,
        external: raw.build?.external,
      },
      security: {
        allowNetwork: raw.security?.allowNetwork ?? DEFAULT_CONFIG.security?.allowNetwork ?? false,
        networkAllowlist: raw.security?.networkAllowlist ?? [],
        allowFileSystem:
          raw.security?.allowFileSystem ?? DEFAULT_CONFIG.security?.allowFileSystem ?? false,
        allowedPaths: raw.security?.allowedPaths,
      },
      staticFiles,
      envVars,
      companions,
    };

    return normalizedConfig;
  }

  /**
   * Gets the Git repository source from an MCP configuration
   * @param config MCP configuration
   * @returns Git repository source
   */
  public static getGitRepoSource(config: MCPConfig): GitRepoSource {
    return {
      url: config.source.repository,
      ref: config.source.ref,
      workingDir: config.source.workingDir, // FIXME: still needed?
    };
  }
}
