#!/usr/bin/env bun
/**
 * create-mcp-tars.ts - Script to create a tar archive of bundled MCP directories
 *
 * This script scans the bundled-mcps directory and creates a single tar archive containing all MCPs,
 * which can then be included as an asset in the binary build.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MCPTarBundler } from '../src/gateway/bundler/mcp-tar-bundler';
import { manifestPath, tarPath } from '../src/gateway/extractor/mcp-extractor';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const bundledMCPsDir = path.join(rootDir, 'bundled-mcps');
const outputTarPath = path.join(rootDir, tarPath);

// Read package version from package.json
function getPackageVersion(): string {
  try {
    const packageJsonPath = path.join(rootDir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || '0.0.0';
  } catch (error) {
    console.warn('Failed to read version from package.json:', error);
    return '0.0.0';
  }
}

export async function main() {
  console.log('🏗️ Creating tar archive for bundled MCPs...');

  const bundler = new MCPTarBundler();
  const { tarPath, mcpNames } = await bundler.bundleMCPs(
    bundledMCPsDir,
    outputTarPath
  );

  // Create a manifest file
  const mcpManifest = {
    version: getPackageVersion(),
    timestamp: new Date().toISOString(),
    mcps: mcpNames
  };

  fs.writeFileSync(manifestPath, JSON.stringify(mcpManifest, null, 2));

  console.log(
    `✅ Created tar archive at ${tarPath} containing ${mcpNames.length} MCPs:`
  );
  for (const name of mcpNames) {
    console.log(`  - ${name}`);
  }
  console.log(`✅ Created manifest at ${manifestPath}`);
}

main().catch((error) => {
  console.error('❌ Failed to create MCP tar archive:', error);
  process.exit(1);
});
