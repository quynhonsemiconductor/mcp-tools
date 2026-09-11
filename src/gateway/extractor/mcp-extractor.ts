import fs from 'fs';
import path from 'path';
import { QNSC_MCP_DIR } from '../../config';
import { logDebug, logError, logWarn } from '../../services/logger';
import { METADATA_FILENAME } from '../bundled-mcp-manager';

/**
 * Interface for the manifest file that stores MCP information
 */
export interface MCPManifest {
  version: string;
  timestamp: string; // Build time of the binary (for cache invalidation)
  mcps: string[];
}

export const tarPath = 'mcps.tar';
export const manifestPath = 'mcp-manifest.json';

/**
 * Shape of the cache directory's version.json file
 */
interface CacheVersionData {
  version: string;
  binaryTimestamp?: string;
}

/**
 * MCPExtractor - Extracts MCP directories from the bundled tar archive
 *
 * This class handles extracting the bundled MCPs from the tar archive embedded in the binary.
 * It manages a cache of extracted MCPs in the user's .qnscmcp directory and only extracts
 * MCPs when necessary (when the version has changed or they don't exist).
 */
export class MCPExtractor {
  private cacheDir: string;
  private manifest?: MCPManifest;
  private initialized = false;

  /**
   * Creates a new MCPExtractor
   * @param cacheDir Optional custom cache directory (defaults to ~/.qnscmcp/bundled)
   */
  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(QNSC_MCP_DIR, 'bundled');
  }

  /**
   * Gets the cache directory path
   */
  getCacheDir(): string {
    return this.cacheDir;
  }

  /**
   * Initializes the extractor, loading or creating the manifest
   * @returns True if initialization succeeded and MCPs are available, false otherwise
   */
  async initialize(): Promise<boolean> {
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Try to load bundled manifest
    try {
      // In bundled mode, mcp-manifest.json is loaded by bun-assets.ts and cached
      // to check its internal cache for files by name
      logDebug(`Loading MCP manifest from ${manifestPath}`);

      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      this.manifest = JSON.parse(manifestContent) as MCPManifest;

      await this.validateCache();
      this.initialized = true;

      return true;
    } catch (error) {
      logWarn('Failed to load MCP manifest:', error);
      return false;
    }
  }

  /**
   * Gets the list of available MCPs
   */
  getAvailableMCPs(): string[] {
    if (!this.manifest) {
      return [];
    }

    return this.manifest.mcps;
  }

  /**
   * Validates the cache against the current version
   */
  private async validateCache(): Promise<void> {
    if (!this.manifest) {
      return;
    }

    const versionFilePath = path.join(this.cacheDir, 'version.json');
    let needsReset = false;

    // Check if version file exists
    if (fs.existsSync(versionFilePath)) {
      try {
        const versionContent = fs.readFileSync(versionFilePath, 'utf8');
        const versionData = JSON.parse(versionContent) as CacheVersionData;

        // Check if version matches
        if (versionData.version !== this.manifest.version) {
          logWarn(
            `MCP cache version mismatch. Cache: ${versionData.version}, Current: ${this.manifest.version}`,
          );
          needsReset = true;
        }

        // Check if binaryTimestamp exists and matches (for same version but different build time)
        // If binaryTimestamp is missing, it's an old cache format - reset it
        if (!needsReset) {
          if (!versionData.binaryTimestamp) {
            logWarn(`MCP cache missing binaryTimestamp field (old cache format), will reset cache`);
            needsReset = true;
          } else if (
            this.manifest.timestamp &&
            versionData.binaryTimestamp !== this.manifest.timestamp
          ) {
            logWarn(
              `MCP cache binary timestamp mismatch. Cache: ${versionData.binaryTimestamp}, Current: ${this.manifest.timestamp}`,
            );
            needsReset = true;
          }
        }
      } catch {
        logWarn('Failed to read version file, will reset cache');
        needsReset = true;
      }
    } else {
      needsReset = true;
    }

    // Reset cache if needed
    if (needsReset) {
      await this.resetCache();
    }
  }

  /**
   * Resets the cache by deleting and recreating it
   */
  private async resetCache(): Promise<void> {
    if (!this.manifest) {
      return;
    }

    // Delete the entire cache directory
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    }

    // Recreate the directory
    fs.mkdirSync(this.cacheDir, { recursive: true });

    // Extract the MCPs
    logDebug('Resetting MCP cache, extracting from tar archive');
    const success = await this.extractMCPs();

    if (success) {
      // Create version file with both timestamps:
      // - timestamp: current time (when cache was extracted)
      // - binaryTimestamp: build time from manifest (for cache invalidation)
      const versionData = {
        version: this.manifest.version,
        timestamp: new Date().toISOString(),
        binaryTimestamp: this.manifest.timestamp,
      };

      fs.writeFileSync(
        path.join(this.cacheDir, 'version.json'),
        JSON.stringify(versionData, null, 2),
      );

      logDebug('MCP cache reset complete');
    }
  }

  /**
   * Extracts all MCPs from the bundled tar file using system tar
   * @returns True if extraction succeeded, false otherwise
   */
  private async extractMCPs(): Promise<boolean> {
    if (!this.manifest) {
      return false;
    }

    const mcpDirTarPath = path.join(QNSC_MCP_DIR, tarPath);
    try {
      if (tarPath === mcpDirTarPath) {
        logError(`Tar path cannot be the same as cache directory path: ${mcpDirTarPath}`);
        return false;
      }

      // Write embedded tar to disk for system tar extraction
      // IMPORTANT: Must use fs.promises.readFile (not a direct import from 'fs/promises')
      // because bun-assets.ts patches fs.promises.readFile at runtime. A direct import
      // captures the original unpatched function reference at import time.
      const tarContent = await fs.promises.readFile(tarPath);
      logDebug(`Read tar file ${tarPath} content of size: ${tarContent.length} bytes`);
      await fs.promises.writeFile(mcpDirTarPath, tarContent);
      logDebug(`Tar file written to ${mcpDirTarPath}`);

      // Extract using system tar
      const success = await this.extractEntireArchive(mcpDirTarPath, this.cacheDir);

      if (!success) {
        logError('Archive extraction failed');
        return false;
      }

      // Verify all MCPs were extracted
      if (this.manifest.mcps.length > 0) {
        let allMCPsAvailable = true;

        for (const mcpName of this.manifest.mcps) {
          const extractPath = path.join(this.cacheDir, mcpName);
          const metadataPath = path.join(extractPath, METADATA_FILENAME);

          if (!fs.existsSync(extractPath)) {
            logError(`MCP directory not found after extraction: ${extractPath}`);
            allMCPsAvailable = false;
          } else if (!fs.existsSync(metadataPath)) {
            logError(`MCP metadata file not found: ${metadataPath}`);
            allMCPsAvailable = false;
          } else {
            logDebug(`Verified MCP: ${mcpName}`);
          }
        }

        if (!allMCPsAvailable) {
          logError('Some MCPs were not properly extracted');
          return false;
        }

        logDebug(`Successfully extracted ${this.manifest.mcps.length} MCPs to cache directory`);
        return true;
      }

      logWarn('No MCPs listed in manifest');
      return false;
    } catch (error) {
      logWarn('Failed to extract MCPs:', error);
      return false;
    } finally {
      // Clean up temporary tar file
      if (fs.existsSync(mcpDirTarPath)) {
        try {
          fs.unlinkSync(mcpDirTarPath);
          logDebug(`Removed temporary tar file: ${mcpDirTarPath}`);
        } catch (error) {
          logDebug(`Failed to remove tar file: ${mcpDirTarPath}`, error);
        }
      }
    }
  }

  /**
   * Gets the path to an extracted MCP
   * @param mcpName Name of the MCP
   * @returns Path to the extracted MCP, or null if not available
   */
  getMCPPath(mcpName: string): string | null {
    if (!this.initialized) {
      logWarn('MCPExtractor not initialized when trying to get MCP path');
      return null;
    }

    const extractPath = path.join(this.cacheDir, mcpName);

    // Check if extracted
    if (!fs.existsSync(extractPath)) {
      logWarn(`MCP ${mcpName} not found in cache (${extractPath})`);
      return null;
    }

    return extractPath;
  }

  /**
   * Checks if an MCP is available
   * @param mcpName Name of the MCP
   * @returns True if the MCP is available in the cache
   */
  isMCPAvailable(mcpName: string): boolean {
    if (!this.initialized || !this.manifest || !this.manifest.mcps.includes(mcpName)) {
      return false;
    }

    // First check if the MCP directory exists
    const extractPath = path.join(this.cacheDir, mcpName);
    if (!fs.existsSync(extractPath)) {
      return false;
    }

    // Then check if metadata.json exists
    const metadataPath = path.join(extractPath, METADATA_FILENAME);
    return fs.existsSync(metadataPath);
  }

  /**
   * Extracts an entire tar archive at once using a multi-method approach
   * This attempts various extraction methods in sequence until one succeeds
   * @param tarPath Path to the tar file to extract
   * @param targetDir Directory to extract to
   * @returns True if extraction succeeded, false otherwise
   */
  async extractEntireArchive(tarPath: string, targetDir: string): Promise<boolean> {
    logDebug(`Attempting to extract entire archive from ${tarPath} to ${targetDir}`);

    try {
      // Import execFile from child_process (avoids shell injection vs exec)
      const { execFile } = await import('child_process');

      // On Windows, execFile needs the .exe extension to locate executables
      // because it does not search PATHEXT like a shell would.
      const tarCmd = process.platform === 'win32' ? 'tar.exe' : 'tar';

      // Check if tar command is available
      const hasTar = await new Promise<boolean>((resolve) => {
        const checkCmd = process.platform === 'win32' ? 'where.exe' : 'which';
        execFile(checkCmd, [tarCmd], (err, stdout) => {
          resolve(!err && stdout.trim().length > 0);
        });
      });

      if (!hasTar) {
        logError('System tar command not found');
        return false;
      }

      logDebug('System tar command found, attempting extraction...');

      // Note: --overwrite is GNU tar only and not supported by macOS BSD tar.
      // BSD tar overwrites existing files by default, so the flag is unnecessary.
      const tarArgs = ['-xf', tarPath, '-C', targetDir];
      logDebug(`Executing system tar with args: ${tarArgs.join(' ')}`);

      const success = await new Promise<boolean>((resolve) => {
        execFile(tarCmd, tarArgs, (error, stdout, stderr) => {
          if (error) {
            logError(`System tar extraction failed: ${error.message}`);
            if (stderr) logError(`Stderr: ${stderr}`);
            resolve(false);
          } else {
            logDebug(`System tar extraction complete: ${stdout || 'No output'}`);
            resolve(true);
          }
        });
      });

      if (success) {
        logDebug('System tar extraction succeeded');
      }
      return success;
    } catch (error) {
      logError('Error during archive extraction:', error);
      return false;
    }
  }
}
