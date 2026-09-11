/**
 * mcp-batch-bundler.ts - Batch bundler for MCP servers from configurations
 *
 * This module handles the bundling of multiple MCP servers based on configuration files.
 */
import fs from 'fs';
import path from 'path';
import { logIf, warnIf } from '../../utils';
import { METADATA_FILENAME } from '../bundled-mcp-manager';
import { MCPConfigLoader } from '../config/mcp-config-loader';
import { BunSubprocessRunner } from '../sandbox/bun-subprocess-runner';
import { scanMCPSecurity } from '../security/mcp-security-scanner';
import { BatchBundleOptions, BundleResult, MCPConfig, SecurityScanResult } from '../types';
import { MCPBundler } from './mcp-bundler';
import { RepoCloner } from './repo-cloner';

/** Shape of a tool entry as returned by the sandboxed MCP's listTools() call */
interface RawToolInfo {
  name?: string;
  description?: string;
  inputSchema?: unknown;
  schema?: unknown;
  annotations?: unknown;
}

/**
 * Batch bundler for MCP servers from configurations
 */
export class MCPBatchBundler {
  private readonly configLoader: MCPConfigLoader;
  private readonly outputDir: string;
  private readonly configDir: string;
  private readonly verbose: boolean;
  private readonly securityScan: boolean;

  /** Maximum number of MCPs to bundle concurrently */
  private static readonly MAX_CONCURRENCY = 4;

  static shouldRefreshConfigMetadata(
    existing: { version?: string; source?: { ref?: string } },
    incoming: { version?: string; source?: { ref?: string } },
  ): boolean {
    return existing.version !== incoming.version || existing.source?.ref !== incoming.source?.ref;
  }

  /**
   * Creates a new batch bundler
   * @param options Bundling options
   */
  constructor(options: BatchBundleOptions) {
    const { configDir, outputDir, verbose = false, securityScan = false } = options;

    this.configLoader = new MCPConfigLoader(configDir, verbose);
    this.outputDir = outputDir;
    this.verbose = verbose;
    this.securityScan = securityScan;

    // Store the configDir for later use when saving metadata.json
    this.configDir = configDir;

    // Ensure output directory exists
    this.ensureDirectoryExists(outputDir);
  }

  /**
   * Bundles all MCPs defined in configuration files
   * @returns Results of bundling operations
   */
  public async bundleAll(): Promise<BundleResult[]> {
    // Load all configurations
    const configs = await this.configLoader.loadAllConfigs();

    logIf(`Found ${configs.length} MCP configurations to bundle`, this.verbose);

    // Filter to only buildable MCPs
    const buildable: { config: MCPConfig; mcpName: string }[] = [];
    for (const { config, fileName } of configs) {
      const mcpName = config.name || fileName;
      if (config.build.enabled === false) {
        logIf(`⏭️  Skipping MCP: ${mcpName} (build.enabled=false)`, this.verbose);
        continue;
      }
      buildable.push({ config, mcpName });
    }

    logIf(
      `Bundling ${buildable.length} MCPs with concurrency ${MCPBatchBundler.MAX_CONCURRENCY}`,
      this.verbose,
    );

    // Bundle MCPs in parallel with concurrency limit
    const results: BundleResult[] = [];
    for (let i = 0; i < buildable.length; i += MCPBatchBundler.MAX_CONCURRENCY) {
      const chunk = buildable.slice(i, i + MCPBatchBundler.MAX_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async ({ config, mcpName }) => {
          try {
            const result = await this.bundleMCP(config, mcpName);
            if (result.success) {
              logIf(`✅ Successfully bundled MCP: ${mcpName}`, this.verbose);
            } else if (this.verbose) {
              console.error(`❌ Failed to bundle MCP: ${mcpName} - ${result.error}`);
            }
            return result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (this.verbose) {
              console.error(`❌ Error bundling MCP ${mcpName}: ${errorMessage}`);
            }
            return {
              name: mcpName,
              path: '',
              success: false,
              error: errorMessage,
            } as BundleResult;
          }
        }),
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Bundles a single MCP from its configuration
   * @param config MCP configuration
   * @param mcpName MCP name
   * @returns Result of bundling operation
   */
  public async bundleMCP(config: MCPConfig, mcpName: string): Promise<BundleResult> {
    try {
      // Prepare source
      const mcpSource = MCPConfigLoader.getGitRepoSource(config);

      console.log(
        `\n\n📦📦📦📦 Bundling MCP: ${mcpName} from source: ${mcpSource.url}@${mcpSource.ref} 📦📦📦📦\n\n`,
      );

      // Ensure package.json is included in static files
      // Create a new config object with the added package.json to static files
      const updatedConfig = { ...config };
      updatedConfig.staticFiles = config.staticFiles ? [...config.staticFiles] : [];

      if (!updatedConfig.staticFiles.includes('package.json')) {
        updatedConfig.staticFiles.push('package.json');
        logIf(`📄 Automatically including package.json as static file`, this.verbose);
      }

      // Ensure package.json is included in companions' staticFiles if needed
      if (updatedConfig.companions && updatedConfig.companions.length > 0) {
        for (const companion of updatedConfig.companions) {
          companion.staticFiles = companion.staticFiles || [];

          if (!companion.staticFiles.includes('package.json')) {
            companion.staticFiles.push('package.json');
            logIf(
              `📄 Automatically including package.json as static file for companion ${companion.name}`,
              this.verbose,
            );
          }
        }
      }

      // Create a fresh bundler instance per MCP to avoid shared state during parallel execution
      const bundler = new MCPBundler();
      const bundleResult = await bundler.bundleMCP({
        mcpName,
        mcpSource,
        buildProject: updatedConfig.build.enabled,
        buildCommand: updatedConfig.build.command,
        entryPoint: updatedConfig.source.entrypoint,
        staticFiles: updatedConfig.staticFiles,
        envVars: updatedConfig.envVars,
        args: updatedConfig.build.args,
        startFunction: updatedConfig.build.startFunction,
        external: updatedConfig.build.external,
        verbose: this.verbose,
        security: updatedConfig.security,
        companions: updatedConfig.companions,
      });

      // Create MCP-specific directory
      const mcpDir = path.join(this.outputDir, mcpName);
      this.ensureDirectoryExists(mcpDir);

      // Create companion directories if needed
      if (bundleResult.metadata.companions && bundleResult.metadata.companions.length > 0) {
        logIf(
          `🔄 Creating directories for ${bundleResult.metadata.companions.length} companions...`,
          this.verbose,
        );

        for (const companion of bundleResult.metadata.companions) {
          // Extract companion directory from bundlePath
          const companionRelativeDir = path.dirname(companion.bundlePath);
          const companionDir = path.join(mcpDir, companionRelativeDir);

          this.ensureDirectoryExists(companionDir);
          logIf(`📂 Created companion directory: ${companionDir}`, this.verbose);
        }
      }

      // Get the entry point path from the config
      const entryPoint = config.source.entrypoint || 'index.js';

      // Create the directory structure for the entrypoint
      const entryDir = path.dirname(entryPoint);
      const entryFileName = path.basename(entryPoint);
      const fullEntryDir = path.join(mcpDir, entryDir);

      // Create the directory structure if needed
      if (entryDir !== '.' && !fs.existsSync(fullEntryDir)) {
        logIf(`Creating directory structure for entrypoint: ${fullEntryDir}`, this.verbose);
        fs.mkdirSync(fullEntryDir, { recursive: true });
      }

      // Set output paths
      const outputFile = path.join(mcpDir, entryPoint);
      const metadataFile = path.join(mcpDir, METADATA_FILENAME);

      logIf(`Writing bundled MCP to: ${outputFile}`, this.verbose);

      // Write bundled MCP
      fs.writeFileSync(outputFile, bundleResult.bundle);

      // Copy subdirectories and files from the bundler's output directory to our output directory
      if (bundleResult.outputDir) {
        try {
          // Get all entries from the bundler output
          const entries = fs.readdirSync(bundleResult.outputDir, {
            withFileTypes: true,
          });

          // Extract the base directory from the entrypoint (e.g., "dist/src" from "dist/src/index.js")
          const baseDirPath = entryDir !== '.' ? path.join(mcpDir, entryDir) : mcpDir;

          logIf(`Using base directory for all files: ${baseDirPath}`, this.verbose);

          // Copy both directories and files from bundler output to the base directory
          for (const entry of entries) {
            // Skip copying if it would conflict with the entrypoint
            if (entry.name === entryFileName && entryDir !== '.') {
              logIf(
                `Skipping duplicate entrypoint file: ${entry.name} (already placed in correct directory)`,
                this.verbose,
              );
              continue;
            }

            // Skip 'companions' directory - it will be handled separately
            if (entry.name === 'companions' && entry.isDirectory()) {
              logIf(`Skipping companions directory - will be handled separately`, this.verbose);
              continue;
            }

            const sourcePath = path.join(bundleResult.outputDir, entry.name);
            const destPath = path.join(baseDirPath, entry.name);

            // Check if this would create a nested directory that duplicates the entrypoint directory
            // E.g. if entrypoint is build/index.js, avoid creating build/build/...
            const entryPoint = updatedConfig.source.entrypoint;
            if (entry.isDirectory() && entryPoint) {
              const entrypointDir = path.dirname(entryPoint);

              // If the entry name matches the entrypoint directory and we're already in that directory
              if (entry.name === entrypointDir && baseDirPath.endsWith(entrypointDir)) {
                logIf(
                  `📂 Skipping duplicate ${entry.name} directory (matches entrypoint dir) in ${baseDirPath}`,
                  this.verbose,
                );
                continue;
              }
            }

            if (entry.isDirectory()) {
              // Copy the directory recursively
              this.copyDirectoryRecursively(sourcePath, destPath);

              logIf(`📂 Copied directory: ${entry.name} to ${baseDirPath}`, this.verbose);
            } else {
              // Create destination directory if it doesn't exist
              const destDir = path.dirname(destPath);
              if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
              }

              // Copy the file
              fs.copyFileSync(sourcePath, destPath);

              logIf(`📄 Copied file: ${entry.name} to ${baseDirPath}`, this.verbose);
            }
          }

          // The companions should already have been copied by the MCPBundler

          // Also check if we need to copy static files from the parent directories
          // of bundleResult.outputDir (for files copied to MCP root)
          if (updatedConfig.staticFiles && updatedConfig.staticFiles.length > 0) {
            // Extract the MCP root directory from bundler output based on the entry point path depth
            let entryPointDir = '';
            if (updatedConfig.source.entrypoint) {
              entryPointDir = path.dirname(updatedConfig.source.entrypoint);
            }

            const bundleDir = bundleResult.outputDir;
            let mcpRootDir = bundleDir;

            // Navigate up from bundleDir by the number of directories in entryPointDir
            if (entryPointDir) {
              const entryPointDirs = entryPointDir.split(path.sep).filter((p) => p.length > 0);
              for (let i = 0; i < entryPointDirs.length; i++) {
                mcpRootDir = path.dirname(mcpRootDir);
              }
            }

            // Look for static files in the mcpRootDir that may have been copied by the MCPBundler and copy them to our output mcpDir
            for (const staticFileEntry of updatedConfig.staticFiles) {
              // Check if the static file entry contains a source:dest format
              const hasCustomDestination = staticFileEntry.includes(':');

              let sourcePath: string;
              let destinationPath: string;

              if (hasCustomDestination) {
                const [sourceFile, destFile] = staticFileEntry.split(':', 2);

                // Always use the original cloned repo as the source - this is the most reliable approach
                sourcePath = path.join(bundleResult.sourceRepoPath || '', sourceFile);

                logIf(`📄 Using direct repo approach for ${sourceFile}`, this.verbose);

                // Simplify destination path calculation - always use mcpDir + destFile
                // This ensures we respect the exact destination path specified
                destinationPath = path.join(mcpDir, destFile);
              } else {
                // Use the direct repo approach for non-custom paths too
                sourcePath = path.join(bundleResult.sourceRepoPath || '', staticFileEntry);
                destinationPath = path.join(mcpDir, staticFileEntry);
              }

              if (fs.existsSync(sourcePath)) {
                // Ensure destination directory exists
                const destDir = path.dirname(destinationPath);
                if (!fs.existsSync(destDir)) {
                  fs.mkdirSync(destDir, { recursive: true });
                }

                try {
                  fs.copyFileSync(sourcePath, destinationPath);
                } catch (copyError) {
                  console.error(`❌ ERROR copying static file: ${staticFileEntry}`);
                  console.error(`❌ Error details: ${String(copyError)}`);
                  console.error(`- Source path: ${sourcePath}`);
                  console.error(`- Destination path: ${destinationPath}`);
                }
              }
            }
          }
        } catch (error) {
          warnIf(`⚠️ Error copying files and directories: ${String(error)}`, this.verbose);
        }

        logIf(`====================================\n`, this.verbose);
      }

      // Create initial metadata without tools
      const metadata = {
        ...bundleResult.metadata,
        security: updatedConfig.security,
        entrypoint: entryPoint, // Include the entrypoint path in metadata
      };

      // Now discover tools using the final bundled file in bundled-mcps/
      logIf(`🔍 Extracting tool information from the bundled file: ${outputFile}`, this.verbose);

      const tools = await this.extractToolInfo(
        outputFile,
        updatedConfig.envVars,
        this.verbose,
        updatedConfig.build.args,
        updatedConfig.security, // Pass the updated security configuration
      );

      if (tools.length > 0) {
        logIf(`🧰 Found ${tools.length} tools after bundling`, this.verbose);

        // Update metadata with discovered tools
        metadata.tools = tools;
      } else {
        logIf(`⚠️ No tools found in the bundled MCP`, this.verbose);
      }

      // Write the final metadata.json with tools discovered from bundled-mcps/
      const metadataContent = JSON.stringify(metadata, null, 2);
      fs.writeFileSync(metadataFile, metadataContent);

      // Also save a copy of metadata.json to the bundled/<SERVER_NAME>/ directory
      try {
        // Use the config directory specified in the constructor options
        const configMetadataFile = path.join(this.configDir, mcpName, METADATA_FILENAME);

        // if we already have a metadata file only update it if the version or source ref has changed
        if (fs.existsSync(configMetadataFile)) {
          const existingMetadata = JSON.parse(fs.readFileSync(configMetadataFile, 'utf-8')) as {
            version?: string;
            source?: { ref?: string };
          };

          if (MCPBatchBundler.shouldRefreshConfigMetadata(existingMetadata, metadata)) {
            logIf(
              `🔄 Updating metadata file due to version/ref change: ${configMetadataFile}`,
              this.verbose,
            );
            fs.writeFileSync(configMetadataFile, metadataContent);
          } else {
            logIf(
              `🛑 Skipping metadata file update (no version or ref change): ${configMetadataFile}`,
              this.verbose,
            );
          }
        } else {
          logIf(`📄 Saving metadata to config directory: ${configMetadataFile}`, this.verbose);
          fs.writeFileSync(configMetadataFile, metadataContent);
        }
      } catch (error) {
        warnIf(`⚠️ Failed to save metadata to config directory: ${String(error)}`, this.verbose);
      }

      // At this point, all necessary files and metadata are in the final location

      // Handle security scanning and cleanup
      let securityScanResult: SecurityScanResult | undefined = undefined;
      try {
        if (this.securityScan) {
          try {
            console.log(`🔒 Performing security scan on bundled MCP: ${mcpName}`);

            // Use the cloned repo source directory for security scanning instead of the bundled output
            if (!bundleResult.sourceRepoPath || !fs.existsSync(bundleResult.sourceRepoPath)) {
              throw new Error(
                `Source repository path not found for security scanning: ${bundleResult.sourceRepoPath || 'undefined'}`,
              );
            }

            securityScanResult = await scanMCPSecurity(bundleResult.sourceRepoPath, metadataFile, {
              verbose: this.verbose,
            });

            logIf(
              `✅ Security scan completed for ${mcpName} with risk score: ${securityScanResult.riskScore}`,
              this.verbose,
            );

            logIf(`Found ${securityScanResult.findings.length} security issues`, this.verbose);

            // Save security scan results to a separate file
            const securityResultsFile = path.join(mcpDir, 'security-scan.json');
            fs.writeFileSync(securityResultsFile, JSON.stringify(securityScanResult, null, 2));

            logIf(`📄 Saved security scan results to: ${securityResultsFile}`, this.verbose);

            // Also update the metadata with security scan summary
            metadata.securityScan = {
              timestamp: securityScanResult.scanTime,
              riskScore: securityScanResult.riskScore,
              summary: securityScanResult.summary,
              findingsCount: securityScanResult.findings.length,
            };

            // Write updated metadata
            const metadataContent = JSON.stringify(metadata, null, 2);
            fs.writeFileSync(metadataFile, metadataContent);

            // Also update the config directory metadata if it exists
            try {
              // Save to config directory (MCP specific directory)
              const configFilePath = path.join(this.configDir, mcpName);
              // Ensure the config directory exists
              if (!fs.existsSync(configFilePath)) {
                fs.mkdirSync(configFilePath, { recursive: true });
              }
              if (fs.existsSync(configFilePath)) {
                const configMetadataFile = path.join(configFilePath, METADATA_FILENAME);
                fs.writeFileSync(configMetadataFile, metadataContent);

                // Also save the security scan results to the config directory
                const configSecurityResultsFile = path.join(configFilePath, 'security-scan.json');
                fs.writeFileSync(
                  configSecurityResultsFile,
                  JSON.stringify(securityScanResult, null, 2),
                );

                logIf(
                  `📄 Saved security scan results to config directory: ${configSecurityResultsFile}`,
                  this.verbose,
                );
              }

              // Save to bundled directory (root level)
              const bundledSecurityResultsFile = path.join(configFilePath, 'security-scan.json');
              fs.writeFileSync(
                bundledSecurityResultsFile,
                JSON.stringify(securityScanResult, null, 2),
              );

              logIf(
                `📄 Saved security scan results to bundled directory: ${bundledSecurityResultsFile}`,
                this.verbose,
              );
            } catch (error) {
              warnIf(`⚠️ Failed to save security scan results: ${String(error)}`, this.verbose);
            }
          } catch (error) {
            console.warn(`⚠️ Security scan failed: ${String(error)}`);
          }
        }
      } finally {
        // Clean up the cloned repository after security scanning (or if security scanning is disabled)
        if (bundleResult.cloneResult?.shouldCleanup) {
          logIf(`🧹 Cleaning up cloned repository after processing`, this.verbose);
          RepoCloner.cleanup(bundleResult.cloneResult);
        }
      }

      // Return success result
      return {
        name: mcpName,
        path: outputFile,
        success: true,
        securityScan: securityScanResult,
      };
    } catch (error) {
      // Return error result
      return {
        name: mcpName,
        path: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Ensures that a directory exists
   * @param dir Directory path
   */
  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      logIf(`Creating directory: ${dir}`, this.verbose);
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Recursively copies a directory
   * @param source Source directory
   * @param destination Destination directory
   */
  /**
   * Extracts tool information from a bundled MCP file
   * @param bundlePath Path to the bundled MCP file
   * @param envVars Environment variables configuration
   * @param verbose Whether to log verbose output
   * @returns Array of tool information
   */
  private async extractToolInfo(
    bundlePath: string,
    envVars?: {
      name: string;
      description?: string;
      required: boolean;
      default?: string;
      mock?: string;
    }[],
    verbose: boolean = false,
    args?: string[],
    _security?: {
      allowNetwork?: boolean;
      networkAllowlist?: string[];
      allowFileSystem?: boolean;
      allowedPaths?: string[];
    },
  ): Promise<any[]> {
    try {
      // Prepare mock environment variables for required fields
      const mockEnvVars: Record<string, string> = {};

      if (envVars && envVars.length > 0) {
        logIf(`🧪 Preparing mock environment variables for required fields...`, verbose);

        for (const envVar of envVars) {
          // Only handle required variables
          if (envVar.required) {
            // First check if already set in process.env
            if (process.env[envVar.name]) {
              mockEnvVars[envVar.name] = process.env[envVar.name]!;
            }
            // Then use mock if provided
            else if (envVar.mock) {
              mockEnvVars[envVar.name] = envVar.mock;
            }
            // Otherwise warn but continue
            else {
              console.warn(
                `⚠️ Required environment variable ${envVar.name} has no mock value and is not set in the environment`,
              );
            }
          }
        }
      }

      // Create a runner to initialize and get tool list
      logIf(`Environment variables transferred: ${JSON.stringify(mockEnvVars)}`, verbose);
      const runner = new BunSubprocessRunner(bundlePath, {
        verbose,
        env: Object.keys(mockEnvVars).length > 0 ? mockEnvVars : undefined,
        args: args,
      });

      try {
        await runner.initialize();
        const tools = await runner.listTools();

        if (tools && Array.isArray(tools)) {
          logIf(`🧰 Received ${tools.length} tools from MCP`, verbose);

          // Convert to our tool info format
          const mappedTools = tools.map((tool: RawToolInfo) => ({
            name: tool.name || 'unknown',
            description: tool.description || `Tool from bundled MCP`,
            schema: tool.inputSchema || tool.schema || {},
            annotations: tool.annotations || {},
          }));

          return mappedTools;
        } else {
          console.log(`⚠️ No tools array found in response: ${JSON.stringify(tools)}`);
        }
      } catch (error) {
        console.log(`⚠️ Failed to extract tool information: ${String(error)}`);
      } finally {
        // Clean up the runner
        await runner.close();
      }
    } catch (error) {
      console.log(`⚠️ Failed to extract tool information: ${String(error)}`);
    }

    // Return empty array if we couldn't extract tools
    return [];
  }

  private copyDirectoryRecursively(source: string, destination: string): void {
    this.ensureDirectoryExists(destination);

    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(destination, entry.name);

      if (entry.isDirectory()) {
        this.ensureDirectoryExists(destPath);
        this.copyDirectoryRecursively(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
