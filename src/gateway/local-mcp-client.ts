/**
 * local-mcp-client.ts - Client for connecting to local MCP servers via stdio
 *
 * This module provides functionality to connect to local MCP servers using
 * the MCP TypeScript SDK's StdioClientTransport and discover their available tools.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { ToolCategories, ToolConfig } from '../registry/types';
import { logDebug, logError, logInfo } from '../services/logger';
import { createToolId, getToolDelimiter } from '../services/tool-id-utils';
import { jsonSchemaToZod, JsonSchema } from './utils/schema-converter';

/**
 * Delimiter used for local MCP tool names
 * Format: serverName{LOCAL_TOOL_DELIMITER}toolName
 * @deprecated Use getToolDelimiter('local') from tool-id-utils instead
 */
export const LOCAL_TOOL_DELIMITER = '__';
/**
 * @deprecated Use TOOL_PREFIXES.local from tool-id-utils instead
 */
export const LOCAL_TOOL_ID_PREFIX = 'local-';

/**
 * Configuration for a local MCP server
 */
export interface LocalMCPServerConfig {
  id: string;
  name: string;
  launch: string;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface LocalMCPInfo {
  name: string;
  tools: LocalMCPTool[];
}

/**
 * Local MCP tool information
 */
export interface LocalMCPTool {
  name: string;
  description: string;
  parameters: JsonSchema; // JSON schema for parameters (from tool.inputSchema in MCP spec)
  serverId: string; // ID of the local server
  serverName: string; // Name of the local server
  annotations: ToolAnnotations;
}

/**
 * MCP client connection info for local servers
 */
interface MCPClientConnection {
  client: Client;
  transport: StdioClientTransport;
  config: LocalMCPServerConfig;
  childProcess?: { pid: number | null };
}

/** A single tool entry as returned by `Client.listTools()`, inferred from the
 * client's own return type so it always matches the SDK version actually
 * loaded (avoids structural drift from importing the `Tool` type separately). */
type McpListedTool = Awaited<ReturnType<Client['listTools']>>['tools'][number];

/** The result shape returned by `Client.callTool()`, inferred the same way. */
type McpCallToolResult = Awaited<ReturnType<Client['callTool']>>;

/**
 * Client for connecting to and managing local MCP servers using stdio
 */
export class LocalMCPClient {
  private connections: Map<string, MCPClientConnection> = new Map();
  private tools: Map<string, LocalMCPTool[]> = new Map();
  private connectionStatus: Map<string, 'connected' | 'disconnected' | 'error'> = new Map();

  /**
   * Connect to a local MCP server via stdio
   */
  public async connectToServer(config: LocalMCPServerConfig): Promise<void> {
    if (!config.enabled) {
      logDebug(`Local MCP server ${config.name} is disabled, skipping`);
      this.connectionStatus.set(config.id, 'disconnected');
      return;
    }

    try {
      await this.connectViaStdio(config);
      // Discover available tools
      await this.discoverTools(config.id);
    } catch (error) {
      logError(`Failed to connect to local MCP server ${config.id}:`, error);
      this.connectionStatus.set(config.id, 'error');
    }
  }

  /**
   * Connect to a local MCP server via stdio
   */
  private async connectViaStdio(config: LocalMCPServerConfig): Promise<void> {
    if (!config.launch) {
      throw new Error(`Launch command is required for stdio connection to ${config.name}`);
    }

    logInfo(`🔌 Connecting to local MCP server: ${config.name} via stdio`);

    // Parse the launch command
    const [command, ...args] = this.parseCommand(config.launch);

    // Prepare environment variables
    const env = this.prepareEnvironment(config.env);

    // Create stdio transport
    const transport = new StdioClientTransport({
      command,
      args,
      env,
      stderr: 'pipe', // Capture stderr for logging
    });

    const client = new Client({
      name: `qnsc-mcp-client-local-${config.id}`,
      version: '1.0.0',
    });

    // Connect to the server via stdio
    await client.connect(transport);

    // Store the connection
    this.connections.set(config.id, {
      client,
      transport,
      config,
      childProcess: { pid: transport.pid },
    });

    const serverVersion = client.getServerVersion();

    if (config.name !== serverVersion?.name) {
      logDebug(
        `Note: Configured server name (${config.name}) differs from server-reported name (${serverVersion?.name})`,
      );
    }

    this.connectionStatus.set(config.id, 'connected');
    logInfo(
      `✅ Connected to local MCP server via stdio: ${serverVersion?.name} (${serverVersion?.version}) [PID: ${transport.pid}]`,
    );

    // Set up stderr logging if available
    if (transport.stderr) {
      transport.stderr.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          logDebug(`[${config.name} stderr] ${output}`);
        }
      });
    }
  }

  /**
   * Parse a command string into command and arguments
   */
  private parseCommand(commandString: string): string[] {
    // Simple parsing - split by spaces but respect quotes
    const regex = /[^\s"]+|"([^"]*)"/gi;
    const parts: string[] = [];
    let match;

    while ((match = regex.exec(commandString)) !== null) {
      parts.push(match[1] || match[0]);
    }

    return parts;
  }

  /**
   * Prepare environment variables for the subprocess
   */
  private prepareEnvironment(customEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};

    // Always include PATH for binary resolution
    if (process.env.PATH) {
      env.PATH = process.env.PATH;
    }

    // Add HOME for user directory resolution
    if (process.env.HOME) {
      env.HOME = process.env.HOME;
    }

    // Merge custom environment variables
    if (customEnv) {
      Object.assign(env, customEnv);
    }

    return env;
  }

  /**
   * Discover tools from a connected local server
   */
  private async discoverTools(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`No connection found for server ${serverName}`);
    }

    try {
      logDebug(`Discovering tools from local MCP server: ${serverName}`);

      // Use the MCP client to list available tools
      const toolsResponse = await connection.client.listTools();

      if (toolsResponse.tools && toolsResponse.tools.length > 0) {
        this.handleToolsResponse(serverName, toolsResponse.tools);
      } else {
        logInfo(`No tools found on local MCP server: ${serverName}`);
        // Still create an empty entry to track that we tried
        this.tools.set(serverName, []);
      }
    } catch (error) {
      logError(`Failed to discover tools from ${serverName}:`, error);
    }
  }

  /**
   * Handle tools response from local server
   */
  private handleToolsResponse(serverName: string, tools: McpListedTool[]): void {
    const localMCPTools: LocalMCPTool[] = tools.map((tool) => ({
      name: tool.name,
      annotations: tool.annotations || {},
      description: tool.description || '',
      // The SDK's `Tool.inputSchema.properties` is typed as `Record<string, object>`
      // (loosely, to accept any JSON Schema draft), while our `JsonSchema` types
      // nested properties recursively as `JsonSchema`. The runtime value is a
      // genuine JSON Schema document either way; this cast just bridges the two
      // schema-shape type representations, not a real `any`-typed unknown.
      parameters: tool.inputSchema as JsonSchema,
      serverId: this.createServerId(serverName),
      serverName,
    }));

    this.tools.set(serverName, localMCPTools);
    logInfo(`📦 Discovered ${localMCPTools.length} tools from local MCP server: ${serverName}`);
  }

  /**
   * Execute a tool on a local server using MCP protocol
   */
  public async executeLocalTool(
    serverName: string,
    toolName: string,
    parameters: Record<string, unknown>,
  ): Promise<McpCallToolResult> {
    const connection = this.connections.get(serverName);
    if (!connection) {
      throw new Error(`No connection to local MCP server: ${serverName}`);
    }

    try {
      logDebug(`Executing local tool ${toolName} on ${serverName} with parameters:`, parameters);

      // Use the MCP client to call the tool
      const result = await connection.client.callTool({
        name: toolName,
        arguments: parameters,
      });

      logDebug(`Local tool execution result:`, result);

      // Return the result content in a standardized format
      return result;
    } catch (error) {
      logError(`Failed to execute local tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Create a unique server ID
   */
  private createServerId(serverName: string): string {
    return serverName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  /**
   * Get all tools from all connected local servers
   */
  public getAllLocalTools(): LocalMCPInfo[] {
    const result: LocalMCPInfo[] = [];

    for (const [serverName, tools] of this.tools.entries()) {
      result.push({
        name: serverName,
        tools,
      });
    }

    return result;
  }

  /**
   * Get tools from a specific local server
   */
  public getToolsFromServer(serverName: string): LocalMCPTool[] {
    return this.tools.get(serverName) || [];
  }

  /**
   * Get connection status for all servers
   */
  public getConnectionStatus(): Record<string, 'connected' | 'disconnected' | 'error'> {
    const status: Record<string, 'connected' | 'disconnected' | 'error'> = {};
    for (const [serverName, state] of this.connectionStatus.entries()) {
      status[serverName] = state;
    }
    return status;
  }

  /**
   * Disconnect from all local servers
   */
  public disconnect(): void {
    for (const [serverName, connection] of this.connections.entries()) {
      try {
        logDebug(`Disconnecting from local MCP server: ${serverName}`);

        // Close the transport which will terminate the child process. disconnect()
        // is synchronous (its callers, e.g. LocalMCPManager.disconnect, don't await
        // per-connection teardown), so this is a deliberate fire-and-forget; log
        // rather than let a rejection go unhandled.
        void connection.transport.close().catch((error: unknown) => {
          logError(`Error closing transport for ${serverName}:`, error);
        });

        this.connectionStatus.set(serverName, 'disconnected');
      } catch (error) {
        logError(`Error disconnecting from ${serverName}:`, error);
      }
    }

    this.connections.clear();
    this.tools.clear();
  }
}

/**
 * Create a tool configuration from a local MCP tool
 */
export function createLocalToolConfig(localTool: LocalMCPTool): ToolConfig {
  // Create a unique tool ID using centralized utility
  const toolId = createToolId('local', localTool.serverId, localTool.name);

  // Convert JSON schema to Zod schema
  const parametersSchema = jsonSchemaToZod(
    localTool.parameters || { type: 'object', properties: {} },
  );

  // Determine category based on server name and tool name
  const category = categorizeLocalTool(localTool);

  const delimiter = getToolDelimiter('local');
  return {
    id: toolId,
    name: `${localTool.serverName}${delimiter}${localTool.name}`,
    description: localTool.description,
    category: category,
    parameters: parametersSchema,
    includeByDefault: true, // Local tools are opt-in by configuration
    annotations: localTool.annotations || {},
    provider: 'local' as const, // Using 'local' provider type for local MCP servers
  };
}

/**
 * Categorize a local tool based on server name and tool functionality
 */
export function categorizeLocalTool(_localTool: LocalMCPTool): ToolCategories {
  // At this time we don't have tool specific categorisation for local mcps
  return 'Uncategorized';
}
