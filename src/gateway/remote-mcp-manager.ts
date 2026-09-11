/**
 * remote-mcp-manager.ts - Manager for remote MCP servers
 *
 * This module manages the lifecycle of remote MCP server connections,
 * registers their tools with the local registry, and handles OAuth challenges.
 */
import { QnscMcpConfig } from '../config';
import { ToolRegistryManager } from '../registry';
import type { ToolConstructor, ToolHandler } from '../registry';
import {
  AVAILABLE_REMOTE_MCP_SERVERS,
  RemoteMCPServerDefinition,
  validateRemoteMCPServerIds,
} from '../remote-mcps/available-remote-servers';
import { logDebug, logError, logInfo, logWarn } from '../services/logger';
import { resolveRemoteServerUrl, RemotePolicy } from './remote-policy';
import {
  createRemoteToolConfig,
  RemoteMCPClient,
  RemoteMCPInfo,
  RemoteMCPServerConfig,
  RemoteMCPTool,
} from './remote-mcp-client';

/**
 * Manager for remote MCP servers
 */
export class RemoteMCPManager {
  private client: RemoteMCPClient;
  private config: QnscMcpConfig;
  private policy?: RemotePolicy;
  private registeredToolIds: Set<string> = new Set();

  /**
   * @param policy - Pre-fetched remote routing policy (see remote-policy.ts).
   *   Passed in rather than fetched here so a single fetch at startup can
   *   drive both host resolution (this class) and local-tool suppression
   *   (applyRemotePolicy) without a redundant network call. Omit to fall
   *   back to every server's compiled-in default URL.
   *
   *   Deliberately scoped to the main `server.ts` startup path only — three
   *   other production call sites intentionally omit it and always use
   *   default URLs, never a policy-driven host override: the CLI's
   *   `remote-mcp --tools` listing (`commands/remote-mcp.ts`), `list-tools`
   *   (`commands/list-tools.ts`), and the web UI's on-demand remote manager
   *   (`services/mcp-unified-service.ts`). These are read-only
   *   inspection/listing paths, not the running server a client actually
   *   connects through, so reflecting a live host override there isn't
   *   expected to matter — but it does mean e.g. `remote-mcp --tools` can
   *   show a different URL than what the running server is actually using.
   */
  constructor(config: QnscMcpConfig, policy?: RemotePolicy) {
    this.config = config;
    this.policy = policy;
    this.client = new RemoteMCPClient();
  }

  /**
   * Initialize connections to selected remote MCP servers
   */
  public async initialize(): Promise<void> {
    const includedRemoteMCPs = this.config.tools?.includeRemoteMCPs;

    if (!includedRemoteMCPs) {
      logDebug('No remote MCP configuration found');
      return;
    }

    // Determine which servers to enable
    const serversToEnable = this.getServersToEnable();

    if (serversToEnable.length === 0) {
      logDebug('No remote MCP servers selected for activation');
      return;
    }

    logInfo(`Initializing ${serversToEnable.length} remote MCP servers`);

    // Validate server IDs and warn about invalid ones
    if (includedRemoteMCPs.length > 0) {
      const { invalid } = validateRemoteMCPServerIds(includedRemoteMCPs);
      if (invalid.length > 0) {
        logWarn(`Invalid remote MCP server IDs found in configuration: ${invalid.join(', ')}`);
        logInfo(
          `Available server IDs: ${AVAILABLE_REMOTE_MCP_SERVERS.map((s) => s.id).join(', ')}`,
        );
      }
    }

    // Connect to all servers
    const connectionPromises = serversToEnable.map((serverDef) => {
      const authType = serverDef.authType;

      if (authType === 'oauth' && !serverDef.oAuthClientInformation) {
        logWarn(
          `Skipping ${serverDef.name}: OAuth authentication requires client credentials. ` +
            `Ensure oAuthClientInformation is configured for this server, ` +
            `or check logs for credential loading errors.`,
        );
        return Promise.resolve();
      }

      // Isolated from resolveRemoteServerUrl's own logic on purpose: this is
      // the per-server fail-safe boundary (matching connectToServer's own
      // try/catch below). Without it, a synchronous throw here would prevent
      // Promise.all from ever being reached, so no other server in this
      // .map() would get a connection attempt either — and since nothing
      // catches it here, the rejection would propagate out of initialize()
      // into initializeRemoteMCPs() and up to server.ts's startup try/catch,
      // forcing the *entire* server into rescue mode (no local tools either)
      // instead of just this one server falling back to its default URL.
      let resolvedUrl: string;
      try {
        resolvedUrl = resolveRemoteServerUrl(serverDef.id, serverDef.url, this.policy);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logError(`Failed to resolve policy-driven URL for ${serverDef.name}, using default: ${msg}`);
        resolvedUrl = serverDef.url;
      }

      const serverConfig: RemoteMCPServerConfig = {
        id: serverDef.id,
        name: serverDef.name,
        url: resolvedUrl,
        parameters: serverDef.parameters,
        headers: serverDef.headers,
        oAuthClientInformation: serverDef.oAuthClientInformation,
        authType,
        enabled: true,
      };
      return this.connectToServer(serverConfig);
    });
    await Promise.all(connectionPromises);
  }

  /**
   * Determine which servers should be enabled based on configuration
   */
  private getServersToEnable(): RemoteMCPServerDefinition[] {
    const remoteMCPConfig = this.config.tools?.includeRemoteMCPs;

    if (!remoteMCPConfig) {
      return [];
    }

    const includedIds = remoteMCPConfig || [];

    // If no include list is specified, start with all available servers
    const candidateServers =
      includedIds.length > 0
        ? AVAILABLE_REMOTE_MCP_SERVERS.filter((server) => includedIds.includes(server.id))
        : [];

    return candidateServers;
  }

  /**
   * Connect to a remote MCP server
   */
  private async connectToServer(serverConfig: RemoteMCPServerConfig): Promise<void> {
    try {
      await this.client.connectToServer(serverConfig);
    } catch (error) {
      // Don't re-throw error - let the connection failure be handled gracefully
      // The client will have created fallback tools if needed
      logError(
        `Connection to remote MCP server ${serverConfig.name} failed, but continuing with fallback tools`,
        error,
      );
    }
  }

  /**
   * Register all remote tools with the tool registry
   */
  public registerWithToolRegistry(registry: ToolRegistryManager): void {
    const allMcps = this.client.getAllRemoteTools();

    if (allMcps.length === 0) {
      logDebug('No remote tools to register');
      return;
    }

    // Count total tools across all MCPs
    const totalTools = allMcps.reduce((sum, mcp) => sum + mcp.tools.length, 0);
    logDebug(`Registering ${totalTools} tools from ${allMcps.length} remote MCP servers`);
    for (const remoteMcp of allMcps) {
      logDebug(`Registering tools from MCP server: ${remoteMcp.name}`);
      for (const remoteTool of remoteMcp.tools) {
        try {
          const toolConfig = createRemoteToolConfig(remoteTool);

          // Create a constructor for the tool handler
          const client = this.client;
          const HandlerConstructor: ToolConstructor = class implements ToolHandler {
            async execute(args: unknown): Promise<unknown> {
              return client.executeRemoteTool(remoteTool.serverName, remoteTool.name, args);
            }

            isEnabled(): boolean {
              const status = client.getConnectionStatus();
              return status[remoteTool.serverName] === 'connected';
            }
          };

          // Register the tool manually
          registry.registerTool(toolConfig.id, toolConfig, HandlerConstructor);
          this.registeredToolIds.add(toolConfig.id);

          logDebug(`Registered remote tool: ${toolConfig.name} (${toolConfig.id})`);
        } catch (error) {
          logError(`Failed to register remote tool ${remoteTool.name}:`, error);
        }
      }
    }
    logDebug(`Successfully registered ${this.registeredToolIds.size} remote tools`);
  }

  /**
   * Get connection status for all remote servers
   */
  public getConnectionStatus(): Record<string, 'connected' | 'disconnected' | 'error'> {
    return this.client.getConnectionStatus();
  }

  /**
   * Get all remote tools
   */
  public getAllRemoteTools(): RemoteMCPInfo[] {
    return this.client.getAllRemoteTools();
  }

  /**
   * Get tools from a specific server
   */
  public getToolsFromServer(serverName: string): RemoteMCPTool[] {
    return this.client.getToolsFromServer(serverName);
  }

  /**
   * Disconnect from all remote servers
   */
  public async disconnect(): Promise<void> {
    logInfo('Disconnecting from all remote MCP servers');

    // Disconnect from remote servers (stdio processes will be cleaned up by the client)
    await this.client.disconnect();
  }

  /**
   * Get statistics about remote MCP connections
   */
  public getStats(): {
    totalServers: number;
    connectedServers: number;
    totalTools: number;
    registeredTools: number;
  } {
    const connectionStatus = this.getConnectionStatus();
    const connectedServers = Object.values(connectionStatus).filter(
      (status) => status === 'connected',
    ).length;

    const allRemoteTools = this.client.getAllRemoteTools();
    return {
      totalServers: AVAILABLE_REMOTE_MCP_SERVERS.length || 0,
      connectedServers,
      totalTools: allRemoteTools.reduce((sum, mcp) => sum + mcp.tools.length, 0),
      registeredTools: this.registeredToolIds.size,
    };
  }
}
