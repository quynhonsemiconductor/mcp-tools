import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  CallToolResult,
  CallToolResultSchema,
  ServerNotification,
  ServerRequest,
  TextContent,
} from '@modelcontextprotocol/sdk/types.js';
import { minimatch } from 'minimatch';
import { QnscMcpConfig, defaultConfig, loadConfig } from '../config';
import { displayError } from '../lib/display';
import { logDebug, logError, logInfo, logWarn } from '../services/logger';
import { createEnvValidatorMiddleware } from './middlewares/env-validator';
import { createGuardrailsMiddleware } from './middlewares/guardrails';
import { createTrackingMiddleware } from './middlewares/tracking';
import {
  ToolConfig,
  ToolConstructor,
  ToolContext,
  ToolExecuteFunction,
  ToolMiddleware,
} from './types';

// Storage for tool class metadata
export const toolRegistry: Map<
  string,
  {
    config: ToolConfig;
    handlerClass: ToolConstructor;
  }
> = new Map();

/**
 * Class decorator for registering tools
 */
export function Tool(config: ToolConfig) {
  return function <T extends ToolConstructor>(constructor: T) {
    if (toolRegistry.has(config.id)) {
      logWarn(`Tool with ID ${config.id} already registered. It will be overwritten.`);
    }

    toolRegistry.set(config.id, {
      config,
      handlerClass: constructor,
    });

    return constructor;
  };
}

/** Narrows an unknown value to a homogeneous array of strings. */
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const contentTransformer = (result: unknown): CallToolResult => {
  const parsed = CallToolResultSchema.safeParse(result);
  if (parsed.success) {
    return parsed.data;
  }
  const stringArrayContent = registry.translateStringArrayToContent(result);
  if (stringArrayContent) {
    return stringArrayContent;
  }
  if (typeof result === 'string') {
    return {
      content: [{ type: 'text', text: result }],
    };
  }
  return result as CallToolResult;
};

/**
 * Class for managing tool registration
 */
export class ToolRegistryManager {
  private initialized = false;
  private config: QnscMcpConfig = defaultConfig;
  private middlewares: ToolMiddleware[] = [];

  /**
   * Reset the registry (only for tests!)
   */
  public resetRegistry(): void {
    toolRegistry.clear();
    this.middlewares = [];
  }

  /**
   * Initialize the registry
   * Loads all tool categories so every tool is discoverable. Heavy SDKs
   * use lazy loading so import cost is minimal (~170ms).
   * Tool filtering (include/exclude) is applied at registration time by shouldIncludeTool().
   *
   * @param silent - Whether to suppress initialization logs
   */
  public async initialize(silent: boolean = true): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration first - this determines which tools to register
      this.config = loadConfig();

      // Load all tool categories. Heavy SDKs are lazy-loaded so the cost is
      // minimal (~170ms). This ensures all tools are discoverable for the
      // config editor, generate-config, and tools.include entries (#864, #775).
      const { loadToolsByCategories } = await import('./tool-loader');
      await loadToolsByCategories();

      // Register built-in middlewares
      this.use(createEnvValidatorMiddleware());
      this.use(createGuardrailsMiddleware());
      this.use(createTrackingMiddleware());

      this.initialized = true;
      if (!silent) {
        logInfo(`🔍 Tool registry initialized with ${toolRegistry.size} tools`);
      }
    } catch (error) {
      displayError(`Error initializing tools`, error);
      logError(
        `Tool registry initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Keep initialized as false so callers can detect the failure
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Check if a tool ID matches any of the patterns (supports exact match or glob)
   */
  private matchesPattern(toolId: string, patterns: string[]): boolean {
    return patterns.some((pattern) => toolId === pattern || minimatch(toolId, pattern));
  }

  /**
   * Check if a tool's category matches any of the configured categories.
   * Supports both exact matches (e.g., "Github: Actions") and parent category
   * prefix matches (e.g., "Github" matches "Github: Actions", "Github: Pulls", etc.)
   */
  private matchesCategory(toolCategory: string, categories: string[]): boolean {
    return categories.some((cat) => toolCategory === cat || toolCategory.startsWith(cat + ': '));
  }

  /**
   * Check if a tool should be included based on the configuration
   */
  private shouldIncludeTool(toolConfig: ToolConfig): boolean {
    // If no tool config is specified, only include tools marked with includeByDefault: true
    if (!this.config?.tools) {
      return toolConfig.includeByDefault === true;
    }

    const { include, exclude, includeCategories, excludeCategories } = this.config.tools;

    // If specific tools are excluded, check if this tool matches any exclude pattern
    if (exclude && exclude.length > 0 && this.matchesPattern(toolConfig.id, exclude)) {
      return false;
    }

    // If specific categories are excluded, check if this tool's category is in the list
    // Supports parent category prefix matching (e.g., "Github" excludes "Github: Actions")
    if (
      excludeCategories &&
      excludeCategories.length > 0 &&
      this.matchesCategory(toolConfig.category, excludeCategories)
    ) {
      return false;
    }

    // Check if tool is explicitly included via include list OR via includeCategories
    // Supports parent category prefix matching (e.g., "Github" includes "Github: Actions")
    const isExplicitlyIncluded =
      (include && include.length > 0 && this.matchesPattern(toolConfig.id, include)) ||
      (includeCategories &&
        includeCategories.length > 0 &&
        this.matchesCategory(toolConfig.category, includeCategories));

    // if this tool is explicitly included, include it
    if (isExplicitlyIncluded === true) {
      return true;
    }

    // If tool is not explicitly included/excluded, fall back to includeByDefault
    return toolConfig.includeByDefault === true;
  }

  /**
   * Register all tools with the MCP server
   */
  public registerAllTools(server: McpServer, silent: boolean = true): void {
    if (!this.initialized) {
      displayError('Tool registry not initialized! Call initialize() first');
    }

    let registeredCount = 0;
    let filteredOutCount = 0;

    toolRegistry.forEach((registration, toolId) => {
      // Check if this tool should be included based on config
      if (!this.shouldIncludeTool(registration.config)) {
        filteredOutCount++;
        return;
      }

      try {
        const handler = new registration.handlerClass();
        const { name, description, parameters, annotations } = registration.config;

        if (handler.isEnabled && !handler.isEnabled(registration.config)) {
          return;
        }

        // Create the base execute function
        const baseExecuteFunction = handler.execute.bind(handler);

        // Apply middleware chain
        const executeFunction = this.createMiddlewareChain(
          toolId,
          registration.config,
          baseExecuteFunction,
        );

        // Create a wrapper that transforms the result to ensure it matches CallToolResult format
        const toolExecuteFunction = async (
          args: unknown,
          ctx?: RequestHandlerExtra<ServerRequest, ServerNotification>,
        ) => {
          // Call the middleware chain with the original args and context, and then transform the result to ensure it matches CallToolResult format
          return contentTransformer(await executeFunction(args, ctx));
        };
        server.registerTool(
          name,
          {
            description,
            inputSchema: parameters,
            annotations,
          },
          toolExecuteFunction,
        );

        registeredCount++;
      } catch (error) {
        displayError(`Failed to register tool ${toolId}`, error);
      }
    });

    if (!silent) {
      logInfo(
        `🔧 Successfully registered ${registeredCount} tools with MCP server` +
          (filteredOutCount > 0 ? ` (${filteredOutCount} tools filtered out by config)` : ''),
      );
    }
  }

  /**
   * Get all tool configurations
   * @param filtered Whether to apply configuration filters
   */
  public getAllTools(filtered: boolean = false): ToolConfig[] {
    const tools = Array.from(toolRegistry.values()).map((registration) => registration.config);

    if (filtered) {
      return tools.filter((tool) => this.shouldIncludeTool(tool));
    }

    return tools;
  }

  /**
   * Get tools by category
   * @param category The category to filter by
   * @param filtered Whether to apply configuration filters
   */
  public getToolsByCategory(category: string, filtered: boolean = false): ToolConfig[] {
    return this.getAllTools(filtered).filter((config) => config.category === category);
  }

  /**
   * Get all categories
   * @param filtered Whether to apply configuration filters
   */
  public getCategories(filtered: boolean = false): string[] {
    const categories = new Set<string>();
    this.getAllTools(filtered).forEach((config) => {
      categories.add(config.category);
    });
    return Array.from(categories);
  }

  /**
   * Get a specific tool by ID
   */
  public getToolById(id: string): ToolConfig | undefined {
    const registration = toolRegistry.get(id);
    return registration ? registration.config : undefined;
  }

  /**
   * Check if a tool exists
   */
  public hasToolWithId(id: string): boolean {
    return toolRegistry.has(id);
  }

  /**
   * Get count of registered tools
   */
  public getToolCount(): number {
    return toolRegistry.size;
  }

  /**
   * Register a middleware function to be applied to all tools
   * @param middleware The middleware function to register
   */
  public use(middleware: ToolMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Create a middleware chain that executes all registered middlewares
   * @param toolId The ID of the tool being executed
   * @param toolConfig The configuration of the tool being executed
   * @param executeFunction The original execute function
   * @returns A function that runs through the middleware chain
   */
  private createMiddlewareChain(
    toolId: string,
    toolConfig: ToolConfig,
    executeFunction: ToolExecuteFunction,
  ): ToolExecuteFunction {
    // The base handler that actually executes the tool
    const baseHandler = async (context: ToolContext): Promise<unknown> => {
      const result: unknown = await executeFunction(context.args, context.ctx);
      return result;
    };

    // Build the middleware chain in reverse order
    let chain = baseHandler;

    // Apply each middleware in reverse order
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      const nextChain = chain;

      chain = async (context: ToolContext): Promise<unknown> => {
        logDebug(`Executing middleware for tool ${toolId}`);
        return middleware(context, nextChain);
      };
    }

    // Return a function that initiates the middleware chain
    return async (
      args: unknown,
      ctx?: RequestHandlerExtra<ServerRequest, ServerNotification>,
    ): Promise<unknown> => {
      const context: ToolContext = {
        toolId,
        toolConfig,
        args,
        ctx,
        id: toolId, // Copy toolId to id for RegistryItemContext compatibility
        config: toolConfig, // Copy toolConfig to config for RegistryItemContext compatibility
      };
      return chain(context);
    };
  }

  /**
   * Dynamically add categories to the exclusion list.
   * Used by remote policy to suppress local tools when remote is preferred.
   */
  public addExcludedCategories(categories: string[]): void {
    if (!this.config.tools) {
      this.config.tools = {};
    }
    if (!this.config.tools.excludeCategories) {
      this.config.tools.excludeCategories = [];
    }
    for (const cat of categories) {
      if (!this.config.tools.excludeCategories.includes(cat)) {
        this.config.tools.excludeCategories.push(cat);
      }
    }
  }

  /**
   * Dynamically add individual tool IDs to the exclusion list.
   * Used by remote policy to suppress specific local tools (not a whole
   * category) when a remote server is preferred. shouldIncludeTool() checks
   * config.tools.exclude before categories, so this wins over any include.
   */
  public addExcludedTools(toolIds: string[]): void {
    if (!this.config.tools) {
      this.config.tools = {};
    }
    if (!this.config.tools.exclude) {
      this.config.tools.exclude = [];
    }
    for (const id of toolIds) {
      if (!this.config.tools.exclude.includes(id)) {
        this.config.tools.exclude.push(id);
      }
    }
  }

  /**
   * Dynamically add categories to the includeCategories list.
   * Used by remote policy to ensure remote tools pass the category filter
   * when they replace suppressed local categories.
   */
  public addIncludedCategories(categories: string[]): void {
    if (!this.config.tools || !this.config.tools.includeCategories) {
      return; // No includeCategories filter active, nothing to do
    }
    for (const cat of categories) {
      if (!this.config.tools.includeCategories.includes(cat)) {
        this.config.tools.includeCategories.push(cat);
      }
    }
  }

  /**
   * Get the current configuration
   */
  public getConfig(): QnscMcpConfig {
    return this.config;
  }

  /**
   * Register a tool manually (alternative to @Tool decorator)
   */
  public registerTool(id: string, config: ToolConfig, handlerClass: ToolConstructor): void {
    toolRegistry.set(id, {
      config,
      handlerClass,
    });
    logInfo(`Manually registered tool: ${config.name} (${id})`);
  }

  /**
   * Helper function to translate an array of strings to MCP's expected content array format.
   * MCP expects tool results to be structured as an array of content objects,
   * each with a 'type' and 'text' property. If the tool returns an array of strings,
   * this logic wraps each string in an object: { type: 'text', text: string }.
   *
   * @param result - The result from the tool, expected to be an array of strings.
   * @returns An object with a 'content' property containing the formatted array, or undefined if not applicable.
   */
  public translateStringArrayToContent(
    result: unknown,
  ): { content: TextContent[] } | undefined {
    if (isStringArray(result)) {
      return {
        content: result.map((item) => ({ type: 'text', text: item })),
      };
    }
    return undefined;
  }
}

// Create singleton instance
export const registry = new ToolRegistryManager();
