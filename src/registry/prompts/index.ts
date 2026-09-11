import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import { QNSC_MCP_DIR, QnscMcpConfig, defaultConfig, loadConfig } from '../../config';
import { displayError } from '../../lib/display';
import { logError, logInfo, logWarn } from '../../services/logger';
import { ensureRepositoryUpToDate, getRepositoryPath } from '../../utils/git';
import { MarkdownPromptHandler } from './markdown-prompt-handler';
import { findMarkdownFiles, parseMarkdownPrompt } from './markdown-prompt-parser';
import {
  PromptConfig,
  PromptConstructor,
  PromptContext,
  PromptLoadFunction,
  PromptMiddleware,
} from './types';

// Storage for prompt class metadata
const registry: Map<
  string,
  {
    config: PromptConfig;
    handlerClass: PromptConstructor;
  }
> = new Map();

/**
 * Class decorator for registering prompts
 */
export function Prompt(config: PromptConfig) {
  return function <T extends PromptConstructor>(constructor: T) {
    if (registry.has(config.id)) {
      logWarn(`Prompt with ID ${config.id} already registered. It will be overwritten.`);
    }

    registry.set(config.id, {
      config,
      handlerClass: constructor,
    });

    return constructor;
  };
}

/**
 * Class for managing prompt registration
 */
export class PromptRegistryManager {
  private initialized = false;
  private config: QnscMcpConfig = defaultConfig;
  private middlewares: PromptMiddleware[] = [];

  /**
   * Reset the registry (only for tests!)
   */
  public resetRegistry(): void {
    registry.clear();
    this.middlewares = [];
  }

  /**
   * Initialize the registry
   * Loads all prompts via static imports and applies config filters
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration
      this.config = loadConfig();

      // Import all prompts from this repository using the loader
      await import('../prompts-loader');

      // Import any additional prompts from external repositories
      await this.loadConfiguredPromptRepositories(this.config.prompts?.repositories || []);

      // Register built-in middlewares
      // Import middlewares to avoid circular dependencies
      const { createEnvValidatorMiddleware } = await import('../middlewares/env-validator');
      const { createTrackingMiddleware } = await import('../middlewares/tracking');
      const { createGuardrailsMiddleware } = await import('../middlewares/guardrails');

      // Initialize middlewares specifically for prompts
      this.use(createEnvValidatorMiddleware()); // First validate environment variables
      this.use(createGuardrailsMiddleware()); // Then apply guardrails
      this.use(createTrackingMiddleware()); // Then apply tracking

      this.initialized = true;
      logInfo(`🔍 Prompt registry initialized with ${registry.size} prompts`);
    } catch (error) {
      displayError(`Error initializing prompts`, error);
      logError('Prompt registration error', { error });
      // Mark as initialized even if there's an error
      this.initialized = true;
    }
  }

  public getFromRegistry(
    id: string,
  ): { config: PromptConfig; handlerClass: PromptConstructor } | undefined {
    return registry.get(id);
  }

  /**
   * Check if a prompt should be included based on the configuration
   */
  private shouldIncludePrompt(_promptConfig: PromptConfig): boolean {
    // TODO: Implement proper prompt filtering based on config
    // This is a placeholder until we update the config schema

    // For now, include all prompts
    return true;
  }

  /**
   * Register all prompts with the MCP server
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  public async registerAllPrompts(server: McpServer): Promise<void> {
    if (!this.initialized) {
      displayError('Prompt registry not initialized! Call initialize() first');
    }

    let registeredCount = 0;
    let filteredOutCount = 0;

    registry.forEach((registration, promptId) => {
      // Check if this prompt should be included based on config
      if (!this.shouldIncludePrompt(registration.config)) {
        filteredOutCount++;
        return;
      }

      try {
        const handler = new registration.handlerClass();
        const { name, description, arguments: promptArguments } = registration.config;

        // Create the base load function
        const baseLoadFunction = handler.load.bind(handler);

        // Apply middleware chain
        const loadFunction = this.createMiddlewareChain(
          promptId,
          registration.config,
          baseLoadFunction,
        );
        server.registerPrompt(
          name,
          {
            argsSchema: promptArguments,
            description,
          },
          loadFunction,
        );

        registeredCount++;
      } catch (error) {
        logError(`Failed to register prompt ${promptId}`, error);
      }
    });

    logInfo(
      `📝 Successfully registered ${registeredCount} prompts with MCP server` +
        (filteredOutCount > 0 ? ` (${filteredOutCount} prompts filtered out by config)` : ''),
    );
  }

  /**
   * Get all prompt configurations
   * @param filtered Whether to apply configuration filters
   */
  public getAllPrompts(filtered: boolean = false): PromptConfig[] {
    const prompts = Array.from(registry.values()).map((registration) => registration.config);

    if (filtered) {
      return prompts.filter((prompt) => this.shouldIncludePrompt(prompt));
    }

    return prompts;
  }

  /**
   * Get prompts by category
   * @param category The category to filter by
   * @param filtered Whether to apply configuration filters
   */
  public getPromptsByCategory(
    category: string,
    filtered: boolean = false,
    sourcePath?: string,
  ): PromptConfig[] {
    return this.getAllPrompts(filtered).filter(
      (config) =>
        config.category === category && (sourcePath ? config.sourcePath === sourcePath : true),
    );
  }

  /**
   * Get all categories
   * @param filtered Whether to apply configuration filters
   */
  public getCategories(filtered: boolean = false): string[] {
    const categories = new Set<string>();
    this.getAllPrompts(filtered).forEach((config) => {
      categories.add(config.category);
    });
    return Array.from(categories);
  }

  /**
   * Get a specific prompt by ID
   */
  public getPromptById(id: string): PromptConfig | undefined {
    const registration = registry.get(id);
    return registration ? registration.config : undefined;
  }

  /**
   * Check if a prompt exists
   */
  public hasPromptWithId(id: string): boolean {
    return registry.has(id);
  }

  public getPromptSources(filtered: boolean = false): string[] {
    const sources = new Set<string>();
    this.getAllPrompts(filtered).forEach((config) => {
      const source = config.sourcePath || 'qnsc-mcp';
      sources.add(source);
    });
    return Array.from(sources);
  }

  /**
   * Get count of registered prompts
   */
  public getPromptCount(): number {
    return registry.size;
  }

  /**
   * Register a middleware function to be applied to all prompts
   * @param middleware The middleware function to register
   */
  public use(middleware: PromptMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Create a middleware chain that executes all registered middlewares
   * @param promptId The ID of the prompt being executed
   * @param promptConfig The configuration of the prompt being executed
   * @param loadFunction The original load function
   * @returns A function that runs through the middleware chain
   */
  private createMiddlewareChain(
    promptId: string,
    promptConfig: PromptConfig,
    loadFunction: PromptLoadFunction,
  ) {
    // The base handler that actually executes the prompt
    const baseHandler = async (context: PromptContext): Promise<string> => {
      const result = await loadFunction(context.args);
      context.result = result; // Store the result in context for middlewares to access
      return result;
    };

    // Build the middleware chain in reverse order
    let chain = baseHandler;

    // Apply each middleware in reverse order
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      const nextChain = chain;

      chain = async (context: PromptContext): Promise<string> => {
        return middleware(context, nextChain);
      };
    }

    // Return a function that initiates the middleware chain
    return async (args: unknown): Promise<GetPromptResult> => {
      const context: PromptContext = {
        promptId,
        promptConfig,
        args,

        // Add RegistryItemContext required properties
        id: promptId,
        config: promptConfig,
      };
      const result = await chain(context);
      const promptResult: GetPromptResult = {
        messages: [
          {
            role: 'assistant',
            content: {
              type: 'text',
              text: result || context.result || '',
            },
          },
        ],
      };
      return promptResult;
    };
  }

  /**
   * Register a prompt manually (alternative to @Prompt decorator)
   */
  public registerPrompt(id: string, config: PromptConfig, handlerClass: PromptConstructor): void {
    registry.set(id, {
      config,
      handlerClass,
    });
    logInfo(`Manually registered prompt: ${config.name} (${id})`);
  }

  private async loadConfiguredPromptRepositories(
    repositories: NonNullable<QnscMcpConfig['prompts']>['repositories'],
  ): Promise<void> {
    if (!repositories || repositories.length === 0) {
      return;
    }

    // Separate remote and local repositories
    const remoteRepos = repositories.filter((repo) => (repo.type || 'remote') === 'remote');
    const localRepos = repositories.filter((repo) => repo.type === 'local');

    // Handle remote repositories (existing logic)
    if (remoteRepos.length > 0) {
      // Check if git is available
      const { isGitInstalled } = await import('../../utils/git');
      if (!(await isGitInstalled())) {
        logInfo('Git is not installed. Skipping remote prompt repositories.');
      } else {
        await this.loadRemotePromptRepositories(remoteRepos);
      }
    }

    // Handle local repositories (new logic)
    if (localRepos.length > 0) {
      await this.loadLocalPromptRepositories(localRepos);
    }
  }

  /**
   * Load prompt repositories from remote Git repositories
   */
  private async loadRemotePromptRepositories(
    repositories: NonNullable<NonNullable<QnscMcpConfig['prompts']>['repositories']>,
  ): Promise<void> {
    const repositoriesPath = path.join(QNSC_MCP_DIR, 'prompt-repositories');

    logInfo(`Processing ${repositories.length} remote prompt repositories from config`);

    for (const repository of repositories) {
      try {
        const repoPath = getRepositoryPath(repository.repo);
        const fullRepoPath = path.join(repositoriesPath, repoPath);

        logInfo(`Updating prompt repository: ${repository.repo}`);

        // Ensure repository is available and up to date
        const success = await ensureRepositoryUpToDate(repository, fullRepoPath);
        if (!success) {
          logInfo(`Failed to update repository ${repository.repo}. Skipping.`);
          continue;
        }

        // Find all markdown files
        const markdownFiles = findMarkdownFiles(fullRepoPath, repository.include);
        logInfo(`Found ${markdownFiles.length} markdown files in ${repository.repo}`);

        // Parse and register each prompt
        for (const filePath of markdownFiles) {
          try {
            const { config, content } = parseMarkdownPrompt(filePath);

            if (!config) {
              continue; // Skip files without valid config
            }

            config.sourceType = 'git';
            config.sourcePath = repository.repo;

            // Create organization-scoped ID to prevent conflicts between repos with same prompt IDs
            const orgScopedId = `${repository.repo}:${config.id}`;
            // Store the original ID for display purposes
            config.originalId = config.id;
            config.id = orgScopedId;

            // Create a constructor function that returns the handler
            const HandlerConstructor = class extends MarkdownPromptHandler {
              constructor() {
                super(content);
              }
            };

            // Register the prompt with the organization-scoped ID
            this.registerPrompt(config.id, config, HandlerConstructor);

            logInfo(
              `Registered external prompt: ${config.name} (${config.originalId}) from ${repository.repo}`,
            );
          } catch (error) {
            logInfo(`Failed to process prompt file ${filePath}: ${String(error)}`);
          }
        }
      } catch (error) {
        logInfo(`Failed to process repository ${repository.repo}: ${String(error)}`);
      }
    }
  }

  /**
   * Load prompt repositories from local filesystem paths
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- implements a Promise-returning interface; async is required by the contract even without an await
  private async loadLocalPromptRepositories(
    repositories: NonNullable<NonNullable<QnscMcpConfig['prompts']>['repositories']>,
  ): Promise<void> {
    logInfo(`Processing ${repositories.length} local prompt repositories from config`);

    for (const repository of repositories) {
      try {
        // For local repositories, repo contains the absolute path
        const localPath = repository.repo;

        logInfo(`Loading local prompt repository: ${localPath}`);

        // Check if path exists
        if (!fs.existsSync(localPath)) {
          logInfo(`Local path does not exist: ${localPath}. Skipping.`);
          continue;
        }

        // Find all markdown files using the absolute path directly
        const markdownFiles = findMarkdownFiles(localPath, repository.include);
        logInfo(`Found ${markdownFiles.length} markdown files in ${localPath}`);

        // Parse and register each prompt
        for (const filePath of markdownFiles) {
          try {
            const { config, content } = parseMarkdownPrompt(filePath);

            if (!config) {
              continue; // Skip files without valid config
            }

            config.sourceType = 'qnsc-mcp'; // Use qnsc-mcp as source type for local
            config.sourcePath = localPath;

            // Create path-scoped ID to prevent conflicts between local repos with same prompt IDs
            const pathScopedId = `local:${path.basename(localPath)}:${config.id}`;
            // Store the original ID for display purposes
            config.originalId = config.id;
            config.id = pathScopedId;

            // Create a constructor function that returns the handler
            const HandlerConstructor = class extends MarkdownPromptHandler {
              constructor() {
                super(content);
              }
            };

            // Register the prompt with the path-scoped ID
            this.registerPrompt(config.id, config, HandlerConstructor);

            logInfo(
              `Registered local prompt: ${config.name} (${config.originalId}) from ${localPath}`,
            );
          } catch (error) {
            logInfo(`Failed to process prompt file ${filePath}: ${String(error)}`);
          }
        }
      } catch (error) {
        logInfo(`Failed to process local repository ${repository.repo}: ${String(error)}`);
      }
    }
  }
}

// Create singleton instance
export const promptRegistry = new PromptRegistryManager();
