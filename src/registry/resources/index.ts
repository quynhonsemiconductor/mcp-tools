import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { QnscMcpConfig, defaultConfig, loadConfig } from '../../config';
import { displayError } from '../../lib/display';
import { logDebug, logError, logInfo, logWarn } from '../../services/logger';
import {
  ResourceConfig,
  ResourceConstructor,
  ResourceContext,
  ResourceLoadFunction,
  ResourceMiddleware,
} from './types';

// re-export types for external use
export * from './types';

// Storage for resource class metadata
export const registry: Map<
  string,
  {
    config: ResourceConfig;
    handlerClass: ResourceConstructor;
  }
> = new Map();

/**
 * Class decorator for registering resources
 */
export function Resource(config: ResourceConfig) {
  return function <T extends ResourceConstructor>(constructor: T) {
    if (registry.has(config.id)) {
      logWarn(`Resource with ID ${config.id} already registered. It will be overwritten.`);
    }

    registry.set(config.id, {
      config,
      handlerClass: constructor,
    });

    return constructor;
  };
}

/**
 * Class for managing resource registration
 */
export class ResourceRegistryManager {
  private initialized = false;
  private config: QnscMcpConfig = defaultConfig;
  private middlewares: ResourceMiddleware[] = [];

  /**
   * Reset the registry (only for tests!)
   */
  public resetRegistry(): void {
    registry.clear();
    this.middlewares = [];
  }

  /**
   * Initialize the registry
   * Loads all resources via static imports and applies config filters
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration
      this.config = loadConfig();

      // Import all resources using the loader
      await import('../resources-loader');

      // Register built-in middlewares
      // Import middlewares to avoid circular dependencies
      const { createEnvValidatorMiddleware } = await import('../middlewares/env-validator');
      const { createTrackingMiddleware } = await import('../middlewares/tracking');
      const { createGuardrailsMiddleware } = await import('../middlewares/guardrails');

      // Initialize middlewares specifically for resources
      this.use(createEnvValidatorMiddleware()); // First validate environment variables
      this.use(createGuardrailsMiddleware()); // Then apply guardrails
      this.use(createTrackingMiddleware()); // Then apply tracking

      this.initialized = true;
      logDebug(`🔍 Resource registry initialized with ${registry.size} resources`);
    } catch (error: any) {
      displayError(`Error initializing resources`, error);
      logError('Resource registration error', { error });
      // Mark as initialized even if there's an error
      this.initialized = true;
    }
  }

  /**
   * Check if a resource should be included based on the configuration
   */
  private shouldIncludeResource(_resourceConfig: ResourceConfig): boolean {
    // TODO: Implement proper resource filtering based on config
    // This is a placeholder until we update the config schema

    // For now, include all resources
    return true;
  }

  /**
   * Register all resources with the MCP server
   */
  public registerAllResources(server: McpServer): void {
    if (!this.initialized) {
      displayError('Resource registry not initialized! Call initialize() first');
    }

    let registeredCount = 0;
    let filteredOutCount = 0;

    registry.forEach((registration, resourceId) => {
      // Check if this resource should be included based on config
      if (!this.shouldIncludeResource(registration.config)) {
        filteredOutCount++;
        return;
      }

      try {
        const handler = new registration.handlerClass();
        const { name, description, arguments: resourceArguments } = registration.config;

        // Create the base load function
        const baseLoadFunction = handler.load.bind(handler);

        // Apply middleware chain
        const loadFunction = this.createMiddlewareChain(
          resourceId,
          registration.config,
          baseLoadFunction,
        );

        let uri = `file://${registration.config.category.toLocaleLowerCase()}/${name.toLowerCase()}`;
        // append each argument (if any) as additional path segments to the URI
        let hasArguments = false;
        if (resourceArguments && resourceArguments.length > 0) {
          hasArguments = true;
          uri += `/${resourceArguments.map((arg) => `{${arg.name}}`).join('/')}`;
        }
        uri = uri.replace(/ /g, '_'); // Replace spaces with underscores for URI

        if (hasArguments) {
          const resourceTemplate: ResourceTemplate = new ResourceTemplate(uri, {
            list: undefined,
          });
          server.registerResource(
            name,
            resourceTemplate,
            {
              description,
            },
            async (uri: URL, variables: Variables) => {
              const result = await loadFunction(uri, variables);

              return {
                contents: [
                  {
                    uri: uri.href,
                    mimeType: 'text/plain', //TODO: Pull this from the resource
                    text: result,
                  },
                ],
              };
            },
          );
        } else {
          server.registerResource(
            name,
            uri,
            {
              description: description,
              mimeType: 'text/plain', //TODO: Pull this from the resource
            },
            async (uri: URL) => {
              const result = await loadFunction(uri, {});

              return {
                contents: [
                  {
                    uri: uri.href,
                    mimeType: 'text/plain', //TODO: Pull this from the resource
                    text: result,
                  },
                ],
              };
            },
          );
        }

        registeredCount++;
      } catch (error) {
        displayError(`Failed to register resource ${resourceId}`, error);
      }
    });

    logDebug(
      `📚 Successfully registered ${registeredCount} resources with MCP server` +
        (filteredOutCount > 0 ? ` (${filteredOutCount} resources filtered out by config)` : ''),
    );
  }

  /**
   * Get all resource configurations
   * @param filtered Whether to apply configuration filters
   */
  public getAllResources(filtered: boolean = false): ResourceConfig[] {
    const resources = Array.from(registry.values()).map((registration) => registration.config);

    if (filtered) {
      return resources.filter((resource) => this.shouldIncludeResource(resource));
    }

    return resources;
  }

  /**
   * Get resources by category
   * @param category The category to filter by
   * @param filtered Whether to apply configuration filters
   */
  public getResourcesByCategory(category: string, filtered: boolean = false): ResourceConfig[] {
    return this.getAllResources(filtered).filter((config) => config.category === category);
  }

  /**
   * Get all categories
   * @param filtered Whether to apply configuration filters
   */
  public getCategories(filtered: boolean = false): string[] {
    const categories = new Set<string>();
    this.getAllResources(filtered).forEach((config) => {
      categories.add(config.category);
    });
    return Array.from(categories);
  }

  /**
   * Get a specific resource by ID
   */
  public getResourceById(id: string): ResourceConfig | undefined {
    const registration = registry.get(id);
    return registration ? registration.config : undefined;
  }

  /**
   * Check if a resource exists
   */
  public hasResourceWithId(id: string): boolean {
    return registry.has(id);
  }

  /**
   * Get count of registered resources
   */
  public getResourceCount(): number {
    return registry.size;
  }

  /**
   * Register a middleware function to be applied to all resources
   * @param middleware The middleware function to register
   */
  public use(middleware: ResourceMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Create a middleware chain that executes all registered middlewares
   * @param resourceId The ID of the resource being executed
   * @param resourceConfig The configuration of the resource being executed
   * @param loadFunction The original load function
   * @returns A function that runs through the middleware chain
   */
  private createMiddlewareChain(
    resourceId: string,
    resourceConfig: ResourceConfig,
    loadFunction: ResourceLoadFunction,
  ): ResourceLoadFunction {
    // The base handler that actually executes the resource
    const finalHandler = async (context: ResourceContext): Promise<string> => {
      const result = await loadFunction(context.uri, context.args);
      context.result = result;
      return result;
    };

    // Build the middleware chain in reverse order
    let chain = finalHandler;

    // Apply each middleware in reverse order
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      const nextChain = chain;

      chain = async (context: ResourceContext): Promise<string> => {
        return middleware(context, nextChain);
      };
    }

    // Return a function that initiates the middleware chain
    return async (uri: URL, variables: Variables): Promise<string> => {
      const context: ResourceContext = {
        resourceId,
        resourceConfig,
        args: variables,
        uri,

        // Add RegistryItemContext required properties
        id: resourceId,
        config: resourceConfig,
      };
      return chain(context);
    };
  }

  /**
   * Register a resource manually (alternative to @Resource decorator)
   */
  public registerResource(
    id: string,
    config: ResourceConfig,
    handlerClass: ResourceConstructor,
  ): void {
    registry.set(id, {
      config,
      handlerClass,
    });
    logInfo(`Manually registered resource: ${config.name} (${id})`);
  }
}

// Create singleton instance
export const resourceRegistry = new ResourceRegistryManager();
