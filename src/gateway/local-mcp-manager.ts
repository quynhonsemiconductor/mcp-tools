/**
 * local-mcp-manager.ts - Manager for local MCP servers
 *
 * This module manages the lifecycle of local MCP server connections via stdio,
 * registers their tools with the local registry, and handles process lifecycle.
 */
import { spawn } from 'child_process';
import { QnscMcpConfig } from '../config';
import {
  AVAILABLE_LOCAL_MCP_SERVERS,
  LocalMCPServerDefinition,
  validateLocalMCPServerIds,
} from '../local-mcps/available-local-servers';
import { ToolHandler, ToolRegistryManager } from '../registry';
import { logDebug, logError, logInfo, logWarn } from '../services/logger';
import {
  createLocalToolConfig,
  LocalMCPClient,
  LocalMCPInfo,
  LocalMCPServerConfig,
  LocalMCPTool,
} from './local-mcp-client';

/**
 * Allowed installation tools for security
 */
const ALLOWED_INSTALLATION_TOOLS = [
  'npm',
  'npx',
  'brew',
  'pip',
  'bun',
  'deno',
  'node',
  'python3',
  'python',
  'dart',
] as const;

/**
 * Manager for local MCP servers
 */
/**
 * The catalogue of installable local MCP servers, as this manager consumes it.
 *
 * Injectable so a test can supply its own servers by passing a value instead of
 * re-registering the `available-local-servers` module. A `mock.module` call
 * cannot be undone in Bun once the binding has been evaluated, so mocking a
 * module this widely imported leaks into every later file in the run — which is
 * exactly what happened here: a canned `validateIds` that ignored its argument
 * escaped into the config validation checks and made them fail depending on
 * which file Bun happened to run last.
 */
export interface LocalMcpCatalogue {
  /** Every server that can be enabled. */
  readonly servers: readonly LocalMCPServerDefinition[];
  /** Partition the given ids into those this catalogue knows and those it does not. */
  validateIds(ids: string[]): { valid: string[]; invalid: string[] };
}

/** The real catalogue, backed by the shipped server definitions. */
export const defaultLocalMcpCatalogue: LocalMcpCatalogue = {
  servers: AVAILABLE_LOCAL_MCP_SERVERS,
  validateIds: (ids) => validateLocalMCPServerIds(ids),
};

export class LocalMCPManager {
  private client: LocalMCPClient;
  private config: QnscMcpConfig;
  private catalogue: LocalMcpCatalogue;
  private installationPromises: Map<string, Promise<void>> = new Map();
  private registeredToolIds: Set<string> = new Set();

  /**
   * @param config - Resolved toolkit configuration
   * @param catalogue - Server catalogue to enable from; defaults to the shipped one
   */
  constructor(config: QnscMcpConfig, catalogue: LocalMcpCatalogue = defaultLocalMcpCatalogue) {
    this.config = config;
    this.client = new LocalMCPClient();
    this.catalogue = catalogue;
  }

  /**
   * Initialize connections to selected local MCP servers
   */
  public async initialize(): Promise<void> {
    const includedLocalMCPs = this.config.tools?.includeLocalMCPs;

    if (!includedLocalMCPs) {
      logDebug('No local MCP configuration found');
      return;
    }

    // Determine which servers to enable
    const serversToEnable = this.getServersToEnable();

    if (serversToEnable.length === 0) {
      logDebug('No local MCP servers selected for activation');
      return;
    }

    logInfo(`Initializing ${serversToEnable.length} local MCP servers`);

    // Validate server IDs and warn about invalid ones
    if (includedLocalMCPs.length > 0) {
      const { invalid } = this.catalogue.validateIds(includedLocalMCPs);
      if (invalid.length > 0) {
        logWarn(`Invalid local MCP server IDs found in configuration: ${invalid.join(', ')}`);
        logInfo(
          `Available server IDs: ${this.catalogue.servers.map((s) => s.id).join(', ')}`,
        );
      }
    }

    // Connect to all servers
    const connectionPromises = serversToEnable.map(async (serverDef) => {
      try {
        // Install dependencies first if needed
        if (serverDef.installation) {
          await this.installDependencies(serverDef);
        }

        // Prepare environment for stdio connections
        const env: Record<string, string> = {};
        if (serverDef.requiredEnvVars) {
          for (const varName of serverDef.requiredEnvVars) {
            const value = process.env[varName];
            if (value !== undefined) {
              env[varName] = value;
            }
          }
        }

        // Merge with any additional env vars from definition
        if (serverDef.env) {
          Object.assign(env, serverDef.env);
        }

        // Build launch command with CLI arguments from config
        let launchCommand = serverDef.launch;
        const configArgs = this.config.tools?.mcpArgs?.[serverDef.id] || [];

        if (configArgs.length > 0) {
          // Quote arguments containing spaces to preserve them
          const quotedArgs = configArgs.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg));
          launchCommand += ' ' + quotedArgs.join(' ');
        }

        const serverConfig: LocalMCPServerConfig = {
          id: serverDef.id,
          name: serverDef.name,
          launch: launchCommand,
          enabled: true,
          env: Object.keys(env).length > 0 ? env : undefined,
        };
        await this.connectToServer(serverConfig);
      } catch (error) {
        logError(`Failed to initialize server ${serverDef.name}:`, error);
        // Continue with other servers even if one fails
      }
    });

    await Promise.allSettled(connectionPromises);
  }

  /**
   * Determine which servers should be enabled based on configuration
   */
  private getServersToEnable(): LocalMCPServerDefinition[] {
    const includedIds = this.config.tools?.includeLocalMCPs;

    if (!includedIds || includedIds.length === 0) {
      return [];
    }

    // Filter available servers by included IDs
    return this.catalogue.servers.filter((server) => includedIds.includes(server.id));
  }

  /**
   * Validate that a command uses an allowed installation tool
   * @param command Command to validate
   * @throws Error if command uses an unapproved tool
   */
  private validateInstallationCommand(command: string): void {
    const trimmed = command.trim();

    if (!trimmed) {
      throw new Error('Security: Installation command cannot be empty');
    }

    const firstWord = trimmed.split(/\s+/)[0];

    // Security: Validate command doesn't contain path separators (prevent /usr/bin/malicious)
    if (firstWord.includes('/') || firstWord.includes('\\')) {
      throw new Error(
        `Security: Installation command must not contain path separators. ` +
          `Got: "${firstWord}". Use command name only.`,
      );
    }

    if (!(ALLOWED_INSTALLATION_TOOLS as readonly string[]).includes(firstWord)) {
      throw new Error(
        `Security: Installation command must start with an allowed tool. ` +
          `Got: "${firstWord}". ` +
          `Allowed: ${ALLOWED_INSTALLATION_TOOLS.join(', ')}`,
      );
    }
  }

  /**
   * Install dependencies for a local MCP server
   * @param config Local MCP server configuration
   */
  public async installDependencies(config: LocalMCPServerDefinition): Promise<void> {
    if (!config.installation) {
      logDebug(`No installation command specified for ${config.name}, skipping installation`);
      return;
    }

    // Check if we're already installing this server
    const existingInstallation = this.installationPromises.get(config.id);
    if (existingInstallation) {
      logDebug(`Installation already in progress for ${config.name}`);
      return existingInstallation;
    }

    const installPromise = this.performInstallation(config);
    this.installationPromises.set(config.id, installPromise);

    try {
      await installPromise;
    } finally {
      this.installationPromises.delete(config.id);
    }
  }

  /**
   * Perform the actual installation
   */
  private async performInstallation(config: LocalMCPServerDefinition): Promise<void> {
    const commands = Array.isArray(config.installation)
      ? config.installation
      : [config.installation!];

    logInfo(`📦 Installing dependencies for ${config.name}...`);

    // Execute each command sequentially
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      logDebug(`Installation command ${i + 1}/${commands.length}: ${command}`);

      await this.executeInstallationCommand(config.name, command);
    }

    logInfo(`✅ Successfully installed dependencies for ${config.name}`);
  }

  /**
   * Execute a single installation command
   */
  private async executeInstallationCommand(
    serverName: string,
    commandString: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Validate installation command uses an allowed tool
      try {
        this.validateInstallationCommand(commandString);
      } catch (error) {
        logError(`Installation command validation failed for ${serverName}`);
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      // Parse the installation command
      const [command, ...args] = this.parseCommand(commandString);

      // SECURITY: Use shell: false to prevent shell injection attacks
      // Commands are executed directly without shell interpretation
      const installProcess = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        detached: false,
      });

      let stdout = '';
      let stderr = '';
      let isKilled = false;

      // SECURITY: Timeout for installation (5 minutes)
      const timeout = setTimeout(
        () => {
          if (!isKilled) {
            isKilled = true;
            installProcess.kill('SIGTERM');
            logError(`Installation timeout for ${serverName} after 5 minutes`);
            reject(new Error(`Installation timeout for ${serverName}`));
          }
        },
        5 * 60 * 1000,
      );

      installProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      installProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      installProcess.on('error', (error) => {
        clearTimeout(timeout);
        logError(`Failed to install ${serverName}:`, error);
        reject(new Error(`Installation failed for ${serverName}: ${error.message}`));
      });

      installProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (isKilled) {
          return; // Already handled by timeout
        }
        if (code === 0) {
          logDebug(`✅ Installation command completed for ${serverName}`);
          resolve();
        } else {
          const errorMsg = `Installation failed for ${serverName} with code ${code}`;
          logError(errorMsg);
          if (stdout) {
            logDebug(`Installation stdout: ${stdout.slice(0, 1000)}`);
          }
          if (stderr) {
            logError(`Installation stderr: ${stderr.slice(0, 1000)}`);
          }
          reject(new Error(errorMsg));
        }
      });
    });
  }

  /**
   * Connect to a local MCP server
   */
  private async connectToServer(serverConfig: LocalMCPServerConfig): Promise<void> {
    try {
      await this.client.connectToServer(serverConfig);
    } catch (error) {
      logError(`Failed to connect to local MCP server ${serverConfig.id}:`, error);
    }
  }

  /**
   * Register all local tools with the tool registry
   */
  public registerWithToolRegistry(registry: ToolRegistryManager): Promise<void> {
    const allLocalTools = this.client.getAllLocalTools();

    if (allLocalTools.length === 0) {
      logDebug('No local MCP tools to register');
      return Promise.resolve();
    }

    logDebug(`Registering tools from ${allLocalTools.length} local MCP servers`);

    for (const localInfo of allLocalTools) {
      for (const localTool of localInfo.tools) {
        const toolConfig = createLocalToolConfig(localTool);

        // Check if already registered
        if (this.registeredToolIds.has(toolConfig.id)) {
          logDebug(`Local tool ${toolConfig.id} already registered, skipping`);
          continue;
        }

        try {
          // Create a tool handler that forwards execution to the local client
          const client = this.client;

          // Create handler constructor
          const HandlerConstructor = class LocalMCPToolHandler implements ToolHandler {
            async execute(args: Record<string, unknown>): Promise<unknown> {
              return client.executeLocalTool(localTool.serverName, localTool.name, args);
            }

            isEnabled(): boolean {
              const status = client.getConnectionStatus();
              return status[localTool.serverName] === 'connected';
            }
          };

          // Register the tool with the registry
          registry.registerTool(toolConfig.id, toolConfig, HandlerConstructor);

          this.registeredToolIds.add(toolConfig.id);
          logDebug(`✅ Registered local tool: ${toolConfig.id}`);
        } catch (error) {
          logError(`Failed to register local tool ${toolConfig.id}:`, error);
        }
      }
    }

    logDebug(
      `✅ Successfully registered ${this.registeredToolIds.size} tools from local MCP servers`,
    );

    return Promise.resolve();
  }

  /**
   * Get connection status for all local servers
   */
  public getConnectionStatus(): Record<string, 'connected' | 'disconnected' | 'error'> {
    return this.client.getConnectionStatus();
  }

  /**
   * Get all local tools
   */
  public getAllLocalTools(): LocalMCPInfo[] {
    return this.client.getAllLocalTools();
  }

  /**
   * Get tools from a specific server
   */
  public getToolsFromServer(serverName: string): LocalMCPTool[] {
    return this.client.getToolsFromServer(serverName);
  }

  /**
   * Disconnect from all local servers
   */
  public disconnect(): Promise<void> {
    logInfo('Disconnecting from all local MCP servers');

    // Disconnect from local servers (stdio processes will be cleaned up by the client)
    this.client.disconnect();

    return Promise.resolve();
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
   * Get statistics about local MCP connections
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

    const allLocalTools = this.client.getAllLocalTools();
    const totalTools = allLocalTools.reduce((sum, info) => sum + info.tools.length, 0);

    return {
      totalServers: this.catalogue.servers.length || 0,
      connectedServers,
      totalTools,
      registeredTools: this.registeredToolIds.size,
    };
  }
}
