/**
 * mcp-unified-service.ts - Unified MCP Service Layer
 *
 * This service provides a single point of access for all MCP operations across
 * all provider types (native, bundled, remote, local). It manages lifecycle,
 * caching, and provides a consistent API for retrieving MCP and tool information.
 *
 * Benefits:
 * - Single source of truth for MCP data
 * - Centralized caching and lifecycle management
 * - Consistent transformation logic
 * - Reduced code duplication
 * - Easier testing and maintenance
 */

import type { QnscMcpConfig } from '../config';
import { BundledMCPManager } from '../gateway/bundled-mcp-manager';
import { LocalMCPManager } from '../gateway/local-mcp-manager';
import { RemoteMCPManager } from '../gateway/remote-mcp-manager';
import { AVAILABLE_LOCAL_MCP_SERVERS } from '../local-mcps/available-local-servers';
import { ToolRegistryManager } from '../registry';
import { AVAILABLE_REMOTE_MCP_SERVERS } from '../remote-mcps/available-remote-servers';
import { logDebug, logError, logInfo } from './logger';
import type { MCPServiceOptions, MCPStats, UnifiedMCPInfo, UnifiedToolInfo } from './mcp-models';
import {
  transformBundledMCP,
  transformLocalMCP,
  transformNativeTools,
  transformRemoteMCP,
} from './mcp-transformers';

/**
 * Cache entry for MCP data
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Unified MCP Service
 * Provides centralized access to all MCP operations
 */
export class MCPUnifiedService {
  private config: QnscMcpConfig;
  private registry: ToolRegistryManager;

  // Manager instances (lifecycle managed)
  private bundledManager: BundledMCPManager | null = null;
  private remoteManager: RemoteMCPManager | null = null;
  private localManager: LocalMCPManager | null = null;

  // Service options
  private options: Required<MCPServiceOptions>;

  // Cache
  private cache: Map<string, CacheEntry<any>> = new Map();
  private configHash: string | null = null;

  /**
   * Creates a new unified MCP service
   *
   * @param config - Configuration object
   * @param registry - Tool registry manager
   * @param options - Service options
   */
  constructor(
    config: QnscMcpConfig,
    registry: ToolRegistryManager,
    options: MCPServiceOptions = {},
  ) {
    this.config = config;
    this.registry = registry;
    this.options = {
      bundledMcpDir: options.bundledMcpDir || this.getDefaultBundledMcpDir(),
      enableCache: options.enableCache !== false,
      cacheTTL: options.cacheTTL || 5 * 60 * 1000, // 5 minutes default
    };

    this.configHash = this.generateConfigHash();
  }

  /**
   * Gets the default bundled MCP directory
   */
  private getDefaultBundledMcpDir(): string {
    // Import dynamically to avoid circular dependencies
    const { DEFAULT_BUNDLED_MCP_DIR } = require('../commands/bundled-mcp');
    return DEFAULT_BUNDLED_MCP_DIR;
  }

  /**
   * Generates a hash of the configuration to detect changes
   */
  private generateConfigHash(): string {
    return JSON.stringify({
      includeMCPs: this.config.tools?.includeMCPs || [],
      includeRemoteMCPs: this.config.tools?.includeRemoteMCPs || [],
      includeLocalMCPs: this.config.tools?.includeLocalMCPs || [],
    });
  }

  /**
   * Checks if configuration has changed and invalidates cache if needed
   */
  private checkConfigChange(): void {
    const newHash = this.generateConfigHash();
    if (newHash !== this.configHash) {
      logInfo('Configuration changed, invalidating cache and managers');
      void this.invalidate();
      this.configHash = newHash;
    }
  }

  /**
   * Gets data from cache if valid
   */
  private getFromCache<T>(key: string): T | null {
    if (!this.options.enableCache) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.options.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Stores data in cache
   */
  private setCache<T>(key: string, data: T): void {
    if (!this.options.enableCache) {
      return;
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Gets or creates the bundled MCP manager
   */
  private async getBundledManager(): Promise<BundledMCPManager> {
    if (!this.bundledManager) {
      this.bundledManager = new BundledMCPManager(this.options.bundledMcpDir);
      await this.bundledManager.initialize();
    }
    return this.bundledManager;
  }

  /**
   * Gets or creates the remote MCP manager
   */
  private async getRemoteManager(): Promise<RemoteMCPManager> {
    if (!this.remoteManager) {
      this.remoteManager = new RemoteMCPManager(this.config);
      await this.remoteManager.initialize();
    }
    return this.remoteManager;
  }

  /**
   * Gets or creates the local MCP manager
   */
  private async getLocalManager(): Promise<LocalMCPManager> {
    if (!this.localManager) {
      this.localManager = new LocalMCPManager(this.config);
      await this.localManager.initialize();
    }
    return this.localManager;
  }

  /**
   * Gets all bundled MCPs
   */
  private async getBundledMCPs(): Promise<UnifiedMCPInfo[]> {
    const cacheKey = 'bundled-mcps';
    const cached = this.getFromCache<UnifiedMCPInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const manager = await this.getBundledManager();
      const bundledMcps = await manager.discoverBundledMCPs();

      const unified = bundledMcps.map((mcp) => transformBundledMCP(mcp, this.config));

      this.setCache(cacheKey, unified);
      return unified;
    } catch (error) {
      logError('Error loading bundled MCPs:', error);
      return [];
    }
  }

  /**
   * Gets all remote MCPs
   */
  private async getRemoteMCPs(): Promise<UnifiedMCPInfo[]> {
    // Don't cache remote MCPs since connection status can change
    // const cacheKey = 'remote-mcps';
    // const cached = this.getFromCache<UnifiedMCPInfo[]>(cacheKey);
    // if (cached) {
    //   return cached;
    // }

    try {
      const manager = await this.getRemoteManager();
      const remoteTools = manager.getAllRemoteTools();
      const connectionStatus = manager.getConnectionStatus();

      const unified = AVAILABLE_REMOTE_MCP_SERVERS.map((serverDef) => {
        const mcpInfo = remoteTools.find((info) => info.name === serverDef.id);
        const status = connectionStatus[serverDef.id] || 'disconnected';

        return transformRemoteMCP(
          mcpInfo || { name: serverDef.id, tools: [] },
          serverDef,
          status,
          this.config,
        );
      });

      // this.setCache(cacheKey, unified);
      return unified;
    } catch (error) {
      logError('Error loading remote MCPs:', error);
      return [];
    }
  }

  /**
   * Gets all local MCPs
   */
  private async getLocalMCPs(): Promise<UnifiedMCPInfo[]> {
    // Don't cache local MCPs since connection status can change
    // const cacheKey = 'local-mcps';
    // const cached = this.getFromCache<UnifiedMCPInfo[]>(cacheKey);
    // if (cached) {
    //   return cached;
    // }

    try {
      const manager = await this.getLocalManager();
      const localTools = manager.getAllLocalTools();
      const connectionStatus = manager.getConnectionStatus();

      const unified = AVAILABLE_LOCAL_MCP_SERVERS.map((serverDef) => {
        const mcpInfo = localTools.find((info) => info.name === serverDef.id);
        const status = connectionStatus[serverDef.id] || 'disconnected';

        return transformLocalMCP(
          mcpInfo || { name: serverDef.id, tools: [] },
          serverDef,
          status,
          this.config,
        );
      });

      // this.setCache(cacheKey, unified);
      return unified;
    } catch (error) {
      logError('Error loading local MCPs:', error);
      return [];
    }
  }

  /**
   * Gets native tools as a unified MCP
   */
  private getNativeMCPs(): UnifiedMCPInfo[] {
    const cacheKey = 'native-mcps';
    const cached = this.getFromCache<UnifiedMCPInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const nativeTools = this.registry.getAllTools();
    const unified = transformNativeTools(nativeTools);

    this.setCache(cacheKey, unified);
    return unified;
  }

  /**
   * Gets all MCPs (bundled, remote, local, and native)
   *
   * @returns Array of all unified MCP information
   */
  public async getAllMCPs(): Promise<UnifiedMCPInfo[]> {
    this.checkConfigChange();

    const [bundled, remote, local, native] = await Promise.all([
      this.getBundledMCPs(),
      this.getRemoteMCPs(),
      this.getLocalMCPs(),
      Promise.resolve(this.getNativeMCPs()),
    ]);

    return [...bundled, ...remote, ...local, ...native];
  }

  /**
   * Gets a specific MCP by ID
   *
   * @param mcpId - MCP identifier
   * @returns Unified MCP information or null if not found
   */
  public async getMCPById(mcpId: string): Promise<UnifiedMCPInfo | null> {
    const allMcps = await this.getAllMCPs();
    return allMcps.find((mcp) => mcp.id === mcpId) || null;
  }

  /**
   * Gets all tools from all MCPs
   *
   * @param enabledOnly - If true, only returns tools from enabled MCPs
   * @returns Array of all unified tool information
   */
  public async getAllTools(enabledOnly: boolean = false): Promise<UnifiedToolInfo[]> {
    const allMcps = await this.getAllMCPs();

    const tools: UnifiedToolInfo[] = [];
    for (const mcp of allMcps) {
      if (enabledOnly && !mcp.enabled) {
        continue;
      }
      tools.push(...mcp.tools);
    }

    return tools;
  }

  /**
   * Gets a specific tool by ID
   *
   * @param toolId - Tool identifier
   * @returns Unified tool information or null if not found
   */
  public async getToolById(toolId: string): Promise<UnifiedToolInfo | null> {
    const allTools = await this.getAllTools();
    return allTools.find((tool) => tool.id === toolId) || null;
  }

  /**
   * Gets statistics about all MCPs
   *
   * @returns Aggregated MCP statistics
   */
  public async getStats(): Promise<MCPStats> {
    const allMcps = await this.getAllMCPs();

    const stats: MCPStats = {
      totalServers: allMcps.length,
      connectedServers: allMcps.filter((m) => m.connected).length,
      totalTools: 0,
      enabledServers: allMcps.filter((m) => m.enabled).length,
      byProvider: {
        native: { servers: 0, tools: 0 },
        bundled: { servers: 0, tools: 0 },
        remote: { servers: 0, tools: 0 },
        local: { servers: 0, tools: 0 },
      },
    };

    for (const mcp of allMcps) {
      const toolCount = mcp.tools.length;
      stats.totalTools += toolCount;

      stats.byProvider[mcp.provider].servers += 1;
      stats.byProvider[mcp.provider].tools += toolCount;
    }

    return stats;
  }

  /**
   * Invalidates all caches and reconnects managers
   * Should be called when configuration changes
   */
  public async invalidate(): Promise<void> {
    logDebug('Invalidating MCP unified service');

    // Clear cache
    this.cache.clear();

    // Disconnect and clear managers
    if (this.remoteManager) {
      try {
        await this.remoteManager.disconnect();
      } catch (error) {
        logError('Error disconnecting remote manager:', error);
      }
      this.remoteManager = null;
    }

    if (this.localManager) {
      try {
        await this.localManager.disconnect();
      } catch (error) {
        logError('Error disconnecting local manager:', error);
      }
      this.localManager = null;
    }

    // Bundled manager doesn't need disconnection
    this.bundledManager = null;

    logDebug('MCP unified service invalidated');
  }

  /**
   * Updates the configuration and invalidates if needed
   *
   * @param config - New configuration object
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  public async updateConfig(config: QnscMcpConfig): Promise<void> {
    this.config = config;
    this.checkConfigChange();
  }

  /**
   * Cleanup resources
   */
  public async dispose(): Promise<void> {
    await this.invalidate();
  }
}
