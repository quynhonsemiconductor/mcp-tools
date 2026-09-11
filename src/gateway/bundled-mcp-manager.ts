/**
 * bundled-mcp-manager.ts - Manager for bundled MCP servers
 *
 * This module manages the discovery, loading, and integration of bundled MCP servers
 * with the main MCP client CLI.
 */
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { EnvVarSchema } from '../env';
import { ToolRegistryManager } from '../registry';
import { BUNDLED_CATEGORY, ToolConfig, ToolConstructor } from '../registry/types';
import { logDebug, logError } from '../services/logger';
import { createToolId, getToolDelimiter } from '../services/tool-id-utils';
import { MCPExtractor } from './extractor/mcp-extractor';
import { SandboxProvider } from './sandbox/sandbox-provider';
import { EnvVarConfig, ToolInfo } from './types';
import { BundledMCPInfo } from './types/bundle';
import {
  MCPSandboxOptions,
  SandboxMCPProviderOptions,
  SandboxMCPResult,
} from './types/sandbox';
import { jsonSchemaToZod } from './utils/schema-converter';

export const METADATA_FILENAME = 'metadata.json';

/**
 * Raw shape of a bundled MCP's metadata.json file, as read from disk.
 * Field names mirror what mcp-batch-bundler.ts actually writes
 * (`entrypoint`, lowercase), which differs from the camelCase `entryPoint`
 * on the `MCPMetadata` type used during the bundling step itself. This type
 * describes the on-disk contract this module reads.
 */
interface BundledMCPMetadataFile {
  name?: string;
  version?: string;
  entrypoint?: string;
  tools?: ToolInfo[];
  envVars?: EnvVarConfig[];
  args?: string[];
}

/**
 * Delimiter used for bundled MCP server tool IDs
 * Format: serverName{BUNDLED_TOOL_DELIMITER}toolName
 * @deprecated Use getToolDelimiter('bundled') from tool-id-utils instead
 */
export const BUNDLED_TOOL_DELIMITER = '__';

/**
 * Creates a tool ID for a bundled MCP tool
 * @deprecated Use createToolId('bundled', mcpName, toolName) from tool-id-utils instead
 */
export function createBundledToolId(mcpName: string, toolName: string): string {
  return createToolId('bundled', mcpName, toolName);
}

/**
 * Creates a display name for a bundled MCP tool
 * @deprecated Use getToolDelimiter('bundled') for the delimiter
 */
export function createBundledToolDisplayName(mcpName: string, toolName: string): string {
  const delimiter = getToolDelimiter('bundled');
  return `${mcpName}${delimiter}${toolName || 'unknown'}`;
}

/**
 * Manager for bundled MCP servers
 */
export class BundledMCPManager {
  private mcpDir: string;
  private bundledMCPs: BundledMCPInfo[] = [];
  private extractor: MCPExtractor;

  /**
   * Creates a new bundled MCP manager
   * @param mcpDir Directory where bundled MCPs are stored
   * @param options Sandbox options
   */
  constructor(mcpDir: string, _options: MCPSandboxOptions = {}) {
    this.mcpDir = mcpDir;
    this.extractor = new MCPExtractor();
  }

  /**
   * Initializes the MCP manager, including extracting bundled MCPs if necessary
   */
  public async initialize(): Promise<void> {
    try {
      // Log which directory we're using
      logDebug(`Initializing BundledMCPManager with directory: ${this.mcpDir}`);

      await this.extractor.initialize();
      await this.discoverBundledMCPs();
    } catch (error) {
      logError('Failed to initialize BundledMCPManager:', error);
    }
  }

  /**
   * Discovers and loads metadata for bundled MCPs
   */
  public discoverBundledMCPs(): Promise<BundledMCPInfo[]> {
    logDebug(`Discovering bundled MCPs...`);
    const mcps: BundledMCPInfo[] = [];

    // First, try to discover MCPs from the extracted cache directory
    try {
      const extractedMcpNames = this.extractor.getAvailableMCPs();

      for (const mcpName of extractedMcpNames) {
        try {
          if (this.extractor.isMCPAvailable(mcpName)) {
            const mcpPath = this.extractor.getMCPPath(mcpName);

            if (mcpPath) {
              const metadataPath = path.join(mcpPath, METADATA_FILENAME);

              if (!fs.existsSync(metadataPath)) {
                logDebug(`Metadata file not found for MCP: ${mcpName} at ${metadataPath}`);
                continue;
              }

              // Read and parse metadata
              const metadata = JSON.parse(
                fs.readFileSync(metadataPath, 'utf8'),
              ) as BundledMCPMetadataFile;

              // Get entrypoint from metadata or default to index.js
              const entrypoint = metadata.entrypoint || 'index.js';
              const indexPath = path.join(mcpPath, entrypoint);

              // Skip if the entrypoint file doesn't exist
              if (!fs.existsSync(indexPath)) {
                logError(`Entrypoint ${entrypoint} not found for MCP ${mcpName}`);
                continue;
              }

              const mcp: BundledMCPInfo = {
                path: indexPath,
                name: metadata.name || mcpName,
                version: metadata.version || '0.0.0',
                tools: metadata.tools || [],
                enabled: false,
                envVars: metadata.envVars,
                args: metadata.args,
              };

              // Add to the list
              mcps.push(mcp);
            }
          }
        } catch (error) {
          logError(`Failed to load extracted MCP: ${mcpName}`, error);
        }
      }
    } catch (error) {
      logError('Failed to discover extracted MCPs:', error);
    }

    // Then, also check the local directory (for development)
    if (fs.existsSync(this.mcpDir)) {
      try {
        // Get all subdirectories in the bundled MCPs directory
        const subdirs = fs
          .readdirSync(this.mcpDir, { withFileTypes: true })
          .filter((dirent) => dirent.isDirectory())
          .map((dirent) => dirent.name);

        for (const dir of subdirs) {
          try {
            const metadataPath = path.join(this.mcpDir, dir, METADATA_FILENAME);

            if (!fs.existsSync(metadataPath)) {
              continue;
            }

            const metadata = JSON.parse(
              fs.readFileSync(metadataPath, 'utf8'),
            ) as BundledMCPMetadataFile;

            const entrypoint = metadata.entrypoint || 'index.js';
            const indexPath = path.join(this.mcpDir, dir, entrypoint);

            // Skip if the entrypoint file doesn't exist
            if (!fs.existsSync(indexPath)) {
              logError(`Entrypoint ${entrypoint} not found for MCP ${dir}`);
              continue;
            }

            const existingMcp = mcps.find((mcp) => mcp.name === (metadata.name || dir));

            if (existingMcp) {
              // Skip if we already have this MCP from the extracted cache
              continue;
            }

            const mcp: BundledMCPInfo = {
              path: indexPath,
              name: metadata.name || dir,
              version: metadata.version || '0.0.0',
              tools: metadata.tools || [],
              enabled: false,
              envVars: metadata.envVars,
              args: metadata.args,
            };

            // Add to the list
            mcps.push(mcp);
          } catch (error) {
            logError(`Failed to load local bundled MCP: ${dir}`, error);
          }
        }
      } catch (error) {
        logError('Failed to discover local MCPs:', error);
      }
    }

    // Store the discovered MCPs
    this.bundledMCPs = mcps;
    logDebug(`Discovered ${mcps.length} bundled MCPs: ${mcps.map((m) => m.name).join(', ')}`);
    return Promise.resolve(mcps);
  }

  /**
   * Registers tools from bundled MCPs with the tool registry
   * @param registry Tool registry to register with
   */
  public async registerWithToolRegistry(registry: ToolRegistryManager): Promise<void> {
    if (this.bundledMCPs.length === 0) {
      await this.discoverBundledMCPs();
    }

    // Register each tool from each MCP
    for (const mcp of this.bundledMCPs) {
      for (const tool of mcp.tools) {
        // Generate properly formatted names and IDs
        const rawToolName = tool.name || 'unknown';
        const toolId = createBundledToolId(mcp.name, rawToolName);
        const displayName = createBundledToolDisplayName(mcp.name, rawToolName); // colon would be nice, but it breaks claude code schema

        // Create a handler class for the tool
        class BundledToolHandler {
          public async execute(args: unknown): Promise<unknown> {
            const config = registry.getConfig();
            const configArgs = config?.tools?.mcpArgs?.[mcp.name] || [];

            // Merge base args from metadata with config args
            const completeArgs = [...(mcp.args || []), ...configArgs];

            const options: MCPSandboxOptions = {
              verbose: false,
              envVars: mcp.envVars,
              args: completeArgs,
            };

            logDebug(
              `Calling tool ${rawToolName} with args: ${JSON.stringify(args)}${completeArgs.length > 0 ? `, CLI args: ${completeArgs.join(' ')}` : ''}`,
            );

            return SandboxProvider.callTool(mcp.path, rawToolName, args, options);
          }

          /**
           * Optional method to check if the tool is enabled
           */
          public isEnabled(_config: ToolConfig): boolean {
            try {
              const config = registry.getConfig();

              // Check if this specific tool is included in the configuration
              const configInclude = config?.tools?.include || [];
              const includeMCPs = config?.tools?.includeMCPs || [];

              // Check if the tool's MCP is explicitly included
              if (includeMCPs.length > 0 && includeMCPs.includes(mcp.name)) {
                return true;
              }

              // Check if the specific tool is explicitly included
              if (configInclude.length > 0 && configInclude.includes(toolId)) {
                return true;
              }

              // If we have explicit inclusions but this tool doesn't match, disable it
              if (configInclude.length > 0 || includeMCPs.length > 0) {
                return false;
              }
            } catch (error) {
              logError(`Failed to check if tool ${toolId} is enabled:`, error);
            }

            // By default, bundled tools are disabled
            return false;
          }
        }

        // Create a Zod schema for the tool using our JSON Schema to Zod converter
        let parameters;
        try {
          // Convert the JSON schema to a Zod schema
          if (tool.schema && typeof tool.schema === 'object') {
            parameters = jsonSchemaToZod(tool.schema);
          } else {
            // Fallback to empty object schema
            parameters = z.object({});
          }
        } catch (err) {
          const errMessage = err instanceof Error ? err.message : String(err);
          logError(`Error processing schema for ${toolId}: ${errMessage}`);
          parameters = z.object({});
        }

        // Extract required environment variables from metadata
        const requiredEnvVars =
          mcp.envVars?.filter((envVar) => envVar.required).map((envVar) => envVar.name) || [];

        // Create tool config for registry
        const toolConfig: ToolConfig = {
          id: toolId,
          name: displayName,
          description: tool.description || `Tool from ${mcp.name}`,
          category: BUNDLED_CATEGORY,
          parameters: parameters,
          includeByDefault: true,
          annotations: tool.annotations || {},
          provider: 'bundled',
        };

        // Add environment variables if any are required. Bundled MCPs declare
        // their own env var names in metadata.json, which aren't statically
        // known members of the app's EnvVarSchema, so a direct assignment
        // isn't type-safe here without changing ToolConfig's contract for
        // every other (native) tool provider. Cast to the declared type
        // rather than to `any` so this stays scoped to the one field.
        if (requiredEnvVars.length > 0) {
          toolConfig.envVars = requiredEnvVars as Array<keyof EnvVarSchema>;
        }

        // Register the tool with the registry
        registry.registerTool(toolId, toolConfig, BundledToolHandler as ToolConstructor);
      }
    }
  }

  /**
   * Gets information about a specific bundled MCP
   * @param mcpNameOrPath Name or path of the MCP
   * @returns MCP information
   */
  public getBundledMCP(mcpNameOrPath: string): BundledMCPInfo | undefined {
    // Make sure we have discovered MCPs
    if (this.bundledMCPs.length === 0) {
      throw new Error('MCPs have not been discovered yet');
    }

    // Find by name or path
    return this.bundledMCPs.find(
      (mcp) =>
        mcp.name === mcpNameOrPath ||
        mcp.path === mcpNameOrPath ||
        path.basename(mcp.path) === mcpNameOrPath,
    );
  }

  /**
   * Gets all bundled MCPs
   * @returns List of bundled MCPs
   */
  public getBundledMCPs(): BundledMCPInfo[] {
    return [...this.bundledMCPs];
  }

  /**
   * Enables or disables a bundled MCP
   * @param mcpNameOrPath Name or path of the MCP
   * @param enabled Whether to enable or disable
   */
  public setBundledMCPEnabled(mcpNameOrPath: string, enabled: boolean): void {
    const mcp = this.getBundledMCP(mcpNameOrPath);
    if (mcp) {
      mcp.enabled = enabled;
    }
  }

  /**
   * Creates a MCP provider for a specific MCP, using the extractor if available
   * @param mcpName Name of the MCP
   * @returns SandboxProvider instance for the MCP
   */
  async createMCPProvider(mcpName: string): Promise<SandboxMCPResult> {
    // Try to get the extracted MCP path
    const extractedPath = this.extractor.isMCPAvailable(mcpName)
      ? this.extractor.getMCPPath(mcpName)
      : null;

    // First try to find the MCP in the bundled MCPs list
    const bundledMcp = this.bundledMCPs.find(
      (mcp) => mcp.name === mcpName || path.basename(mcp.path, '.js') === mcpName,
    );

    if (!bundledMcp && !extractedPath) {
      throw new Error(`MCP ${mcpName} not found`);
    }

    // If we found the MCP in our local directory, use that path
    // bundledMcp.path already contains the full path to the entry point
    const bundlePath = bundledMcp ? bundledMcp.path : null; // We'll determine the extracted path below

    // Determine the metadata path based on what we have
    const metadataPath = bundledMcp
      ? path.join(path.dirname(bundledMcp.path), METADATA_FILENAME)
      : extractedPath
        ? path.join(extractedPath, METADATA_FILENAME)
        : null;
    // Default entrypoint if we need to find it for extracted MCPs
    let entrypoint = 'index.js';

    // Try to read environment variables, and entrypoint from metadata
    let envVarsFromMetadata: EnvVarConfig[] | undefined;

    if (metadataPath && fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(
          fs.readFileSync(metadataPath, 'utf8'),
        ) as BundledMCPMetadataFile;
        entrypoint = metadata.entrypoint || entrypoint;
        envVarsFromMetadata = metadata.envVars;
      } catch (error) {
        logError(`Failed to read metadata for ${mcpName}:`, error);
      }
    }

    const providerOptions: SandboxMCPProviderOptions = {
      verbose: false,
    };

    // Add environment variables with proper priority
    // 1. From bundled MCP object (highest priority)
    // 2. From metadata.json file directly
    if (bundledMcp?.envVars) {
      providerOptions.envVars = bundledMcp.envVars;
      logDebug(
        `Using ${bundledMcp.envVars.length} environment variables from bundled MCP object for ${mcpName}`,
      );
    } else if (envVarsFromMetadata) {
      providerOptions.envVars = envVarsFromMetadata;
      logDebug(
        `Using ${envVarsFromMetadata.length} environment variables from ${METADATA_FILENAME} for ${mcpName}`,
      );
    }

    let mcpPath: string;

    if (bundlePath) {
      // Use bundlePath directly if we have it (from bundledMcp)
      mcpPath = bundlePath;
    } else if (extractedPath) {
      // For extracted MCPs, construct the path with the correct entrypoint
      mcpPath = path.join(extractedPath, entrypoint);
      providerOptions.extractedPath = mcpPath;
    } else {
      throw new Error(`Could not determine path for MCP ${mcpName}`);
    }

    return SandboxProvider.initializeMCP(mcpPath, providerOptions);
  }
}
