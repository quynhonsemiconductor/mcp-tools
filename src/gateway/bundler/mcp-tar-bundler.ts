import fs from 'fs';
import path from 'path';
import { create } from 'tar';

/**
 * MCPTarBundler - Creates tar archives from MCP directories
 * This class provides functionality for bundling MCP directories into a single tar file
 * for inclusion in the binary distribution.
 */
export class MCPTarBundler {
  /**
   * Creates a single tar archive containing all MCP directories
   * @param mcpsDir Directory containing MCP directories
   * @param outputPath Path to output the tar file
   * @returns Object with the tar path and list of MCP names included
   */
  async bundleMCPs(
    mcpsDir: string,
    outputPath: string,
  ): Promise<{ tarPath: string; mcpNames: string[] }> {
    // Create output directory if it doesn't exist
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(mcpsDir)) {
      return { tarPath: outputPath, mcpNames: [] };
    }

    const entries = fs.readdirSync(mcpsDir, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());
    const mcpNames = directories.map((dir) => dir.name);

    if (directories.length === 0) {
      return { tarPath: outputPath, mcpNames: [] };
    }

    // Create tar archive containing all MCP directories
    await create(
      {
        file: outputPath,
        cwd: mcpsDir, // Set the working directory to the MCPs directory
        portable: true, // Ensures maximum compatibility
        gzip: false, // We want plain tar, not tar.gz
      },
      mcpNames, // Include all MCP directories
    );

    return { tarPath: outputPath, mcpNames };
  }
}
