import chalk from 'chalk';
import { QnscMcpConfig, loadConfig } from '../config';
import { LocalMCPManager } from '../gateway/local-mcp-manager';
import { displayError, displayHeader, writeJsonOutput } from '../lib/display';
import {
  AVAILABLE_LOCAL_MCP_SERVERS,
  LocalMCPServerDefinition,
} from '../local-mcps/available-local-servers';
import { registry, ToolRegistryManager } from '../registry';
import { logInfo } from '../services/logger';

/**
 * Builds a registry-style JSON representation of a local MCP server.
 * Exported for direct testing of the env-scrubbing contract.
 */
export function buildLocalMCPRegistryEntry(server: LocalMCPServerDefinition): Record<string, any> {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    category: server.category,
    launch: server.launch,
    ...(server.installation ? { installation: server.installation } : {}),
    ...(server.requiredEnvVars && server.requiredEnvVars.length > 0
      ? { requiredEnvVars: server.requiredEnvVars }
      : {}),
    ...(server.env ? { env: Object.keys(server.env) } : {}),
  };
}

export async function listLocalMCPs(): Promise<void> {
  const asJson = process.argv.includes('--json') || process.argv.includes('-j');
  const filtered = process.argv.includes('--filtered') || process.argv.includes('-f');

  if (asJson) {
    try {
      const config = loadConfig();
      const servers = AVAILABLE_LOCAL_MCP_SERVERS.filter((server) => {
        if (filtered) {
          return config.tools?.includeLocalMCPs?.some((cfg) => cfg === server.id);
        }
        return true;
      });
      await writeJsonOutput(servers.map(buildLocalMCPRegistryEntry));
    } catch (error) {
      displayError('Failed to list local MCPs', error);
      throw error;
    }
    return;
  }

  displayHeader();

  const config = loadConfig();
  let manager: LocalMCPManager | null = null;
  try {
    // Initialize the registry to discover tools
    await registry.initialize();
    manager = await initializeLocalMCPs(config, registry);
    const mcps = manager.getAllLocalTools();
    console.log(chalk.blue(`\nLocal MCPs (${mcps.length}):`));

    for (const mcp of mcps) {
      console.log(chalk.green(`\n  ${mcp.name}`));
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

    // Display stats
    const stats = manager.getStats();
    console.log(chalk.blue(`\nSummary:`));
    console.log(`  Total servers: ${stats.totalServers}`);
    console.log(`  Connected servers: ${stats.connectedServers}`);
    console.log(`  Total tools: ${stats.totalTools}`);
    console.log(`  Registered tools: ${stats.registeredTools}`);
  } catch (error) {
    displayError('Failed to list local MCPs', error);
    throw error;
  } finally {
    if (manager) await manager.disconnect();
  }
}

export async function initializeLocalMCPs(
  config: QnscMcpConfig,
  registry: ToolRegistryManager,
): Promise<LocalMCPManager> {
  logInfo('Initializing local MCP servers...');
  const localMCPManager = new LocalMCPManager(config);
  await localMCPManager.initialize();
  await localMCPManager.registerWithToolRegistry(registry);

  const stats = localMCPManager.getStats();
  logInfo(
    `Local MCP: ${stats.connectedServers}/${stats.totalServers} servers connected, ${stats.registeredTools} tools registered`,
  );
  return localMCPManager;
}
