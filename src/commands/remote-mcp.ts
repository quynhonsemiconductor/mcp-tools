import chalk from 'chalk';
import { QnscMcpConfig, loadConfig } from '../config';
import { RemoteMCPManager } from '../gateway/remote-mcp-manager';
import { RemotePolicy } from '../gateway/remote-policy';
import { displayError, displayHeader, writeJsonOutput } from '../lib/display';
import { registry, ToolRegistryManager } from '../registry';
import {
  AVAILABLE_REMOTE_MCP_SERVERS,
  RemoteMCPServerDefinition,
} from '../remote-mcps/available-remote-servers';
import { logInfo } from '../services/logger';

/**
 * Builds a registry-style JSON representation of a remote MCP server.
 * Exported for direct testing of the header-scrubbing contract.
 */
export function buildRemoteMCPRegistryEntry(
  server: RemoteMCPServerDefinition,
): Record<string, any> {
  const entry: Record<string, any> = {
    id: server.id,
    name: server.name,
    description: server.description,
    url: server.url,
    category: server.category,
    ...(server.authType ? { authType: server.authType } : {}),
    ...(server.requiredEnvVars && server.requiredEnvVars.length > 0
      ? { requiredEnvVars: server.requiredEnvVars }
      : {}),
    ...(server.headers ? { headers: Object.keys(server.headers) } : {}),
  };

  return entry;
}

export async function listRemoteMCPs(): Promise<void> {
  const asJson = process.argv.includes('--json') || process.argv.includes('-j');
  const tools = process.argv.includes('--tools') || process.argv.includes('-t');
  const filtered = process.argv.includes('--filtered') || process.argv.includes('-f');

  if (!asJson) {
    displayHeader();
  }
  let manager: RemoteMCPManager | null = null;
  if (!tools) {
    try {
      const config = loadConfig();
      const servers = AVAILABLE_REMOTE_MCP_SERVERS.filter((server) => {
        if (filtered) {
          return config.tools?.includeRemoteMCPs?.some((cfg) => cfg === server.id);
        }
        return true;
      });
      if (asJson) {
        await writeJsonOutput(servers.map(buildRemoteMCPRegistryEntry));
      } else {
        console.log(chalk.blue(`\nAvailable Remote MCP Servers (${servers.length}):`));
        for (const server of servers) {
          console.log(chalk.green(`\n  ${server.name} (${server.id})`));
          if (server.description) {
            console.log(`\tDescription: ${server.description}`);
          }
          if (server.url) {
            console.log(`\tURL: ${chalk.blue(server.url)}`);
          }
        }
      }
    } catch (error) {
      displayError('Failed to list remote MCPs', error);
      throw error;
    }
    return;
  }
  try {
    const config = loadConfig();
    await registry.initialize();
    manager = await initializeRemoteMCPs(config, registry);
    const mcps = manager.getAllRemoteTools();

    console.log(chalk.blue(`\nRemote MCPs (${mcps.length}):`));

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
  } catch (error) {
    displayError('Failed to list remote MCPs', error);
    throw error;
  } finally {
    if (manager) await manager.disconnect();
  }
}

export async function initializeRemoteMCPs(
  config: QnscMcpConfig,
  registry: ToolRegistryManager,
  policy?: RemotePolicy,
): Promise<RemoteMCPManager> {
  logInfo('Initializing remote MCP servers...');
  const remoteMCPManager = new RemoteMCPManager(config, policy);
  await remoteMCPManager.initialize();
  remoteMCPManager.registerWithToolRegistry(registry);

  const stats = remoteMCPManager.getStats();
  logInfo(
    `Remote MCP: ${stats.connectedServers}/${stats.totalServers} servers connected, ${stats.registeredTools} tools registered`,
  );
  return remoteMCPManager;
}
