/**
 * bundled-mcp.ts - Commands for managing bundled MCP servers
 *
 * This module provides commands for bundling, listing, and using third-party MCP servers.
 */
import chalk from 'chalk';
import path from 'path';
import { QNSC_MCP_DIR } from '../config';
import { BundledMCPManager } from '../gateway/bundled-mcp-manager';
import { BundledMCPInfo } from '../gateway/types/bundle';
import { displayError, displayHeader, writeJsonOutput } from '../lib/display';
import { registry } from '../registry';
import { logError } from '../services/logger';

/**
 * Builds the JSON-safe representation of a bundled MCP entry.
 * Exported for direct testing of the EnvVarConfig scrubbing contract —
 * `default` and `mock` fields on EnvVarConfig can hold real credential
 * values (see env-filter.ts, mcp-batch-bundler.ts) and must never appear
 * in `list-bundled-mcps --json` output.
 */
export function buildBundledMCPJsonEntry(mcp: BundledMCPInfo): Record<string, any> {
  return {
    name: mcp.name,
    version: mcp.version,
    path: mcp.path,
    tools: mcp.tools,
    enabled: mcp.enabled,
    ...(mcp.envVars && mcp.envVars.length > 0
      ? {
          envVars: mcp.envVars.map(({ name, description, required }) => ({
            name,
            description,
            required,
          })),
        }
      : {}),
    ...(mcp.args && mcp.args.length > 0 ? { args: mcp.args } : {}),
  };
}

// Default location for bundled MCPs
export const DEFAULT_BUNDLED_MCP_DIR = path.join(QNSC_MCP_DIR, 'bundled');

/**
 * Options for listing bundled MCPs
 */
export interface ListOptions {
  json?: boolean;
  dir?: string;
}

/**
 * Lists bundled MCP servers
 * @param options Listing options
 */
export async function listBundledMCPs(options: ListOptions = {}): Promise<void> {
  const { json = false, dir = DEFAULT_BUNDLED_MCP_DIR } = options;
  if (!json) {
    displayHeader();
  }
  try {
    const manager = new BundledMCPManager(dir);
    await manager.initialize();

    const mcps = await manager.discoverBundledMCPs();

    if (json) {
      await writeJsonOutput(mcps.map(buildBundledMCPJsonEntry));
    } else {
      console.log(chalk.blue(`\n📦 Bundled MCPs (${mcps.length}):`));

      for (const mcp of mcps) {
        console.log(chalk.green(`\n  ${mcp.name} (v${mcp.version})`));
        console.log(`  Path: ${mcp.path}`);
        console.log(`  Tools: ${mcp.tools.length}`);

        if (mcp.tools.length > 0) {
          console.log(`  Available Tools:`);
          for (const tool of mcp.tools) {
            console.log(
              `    - ${tool.name}`, //: ${tool.description || 'No description'}`
            );
          }
        }
      }
    }
  } catch (error) {
    displayError('Failed to list bundled MCPs', error);
    throw error;
  }
}

/**
 * Initializes the bundled MCP registry and integrates with the main registry
 * @param toolRegistry Tool registry to register with
 * @param dir Directory containing bundled MCPs
 */
export async function initializeBundledMCPs(
  toolRegistry = registry,
  dir: string = DEFAULT_BUNDLED_MCP_DIR,
): Promise<void> {
  try {
    const manager = new BundledMCPManager(dir);
    await manager.initialize();
    await manager.registerWithToolRegistry(toolRegistry);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError('Failed to initialize bundled MCPs:', errorMessage);
  }
}
