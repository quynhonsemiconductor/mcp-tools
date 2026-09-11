import env from '../../env';
import { UserError } from '../../utils';
import { GenericMiddleware, RegistryItemContext, getConfigFromContext } from './types';

/**
 * Finds env vars from `varNames` that are missing or blank in `source`.
 * `skip` names are exempt (e.g. GITHUB_TOKEN, handled by GithubBaseTool.isEnabled()
 * which also checks a stored OAuth token).
 */
function findMissingVars(
  varNames: string[],
  source: Record<string, unknown>,
  skip: Set<string> = new Set(),
): string[] {
  return varNames
    .filter((varName) => !skip.has(varName))
    .filter((varName) => !String(source[varName] ?? '').trim())
    .map(String);
}

/**
 * Creates a middleware that validates required environment variables before execution
 * This middleware is generic and works with both tools and prompts
 *
 * @template T - Type of context (must extend RegistryItemContext)
 * @template R - Return type from the middleware chain
 * @returns A middleware function that validates environment variables
 */
export function createEnvValidatorMiddleware<
  T extends RegistryItemContext,
  R = unknown,
>(): GenericMiddleware<T, R> {
  return async (context: T, next: (context: T) => Promise<R>): Promise<R> => {
    // Get the config using the utility function
    const config = getConfigFromContext(context);

    // If the registry item has specified required environment variables
    if (config?.envVars && config.envVars.length > 0) {
      // Special handling for bundled MCP tools — identified by their registered
      // provider (set at registration in bundled-mcp-manager.ts), not by
      // sniffing the tool ID for gateway-internal delimiter formatting.
      const isBundledMCPTool = config.provider === 'bundled';

      // Built-in tools validate against the parsed env schema (skipping
      // GITHUB_TOKEN, which GithubBaseTool checks itself). Bundled MCP tools
      // aren't in the schema — their vars are declared in the MCP's own
      // metadata.json — so check process.env directly instead.
      const missingVars = isBundledMCPTool
        ? findMissingVars(config.envVars, process.env)
        : findMissingVars(config.envVars, env, new Set(['GITHUB_TOKEN']));

      // If any required variables are missing, throw an error
      if (missingVars.length > 0) {
        const itemType = 'toolId' in context ? 'tool' : 'prompt';
        const itemName = config.name || config.id;

        const errorMessage = `Missing required environment variables for ${itemType} ${itemName}: ${missingVars.join(', ')}`;

        // For bundled MCP tools, provide more helpful error message
        if (isBundledMCPTool) {
          // This is more explicit for bundled MCPs
          throw new UserError(
            `${errorMessage}\n\nThese variables are defined in the MCP's metadata.json file and must be set in your environment.`,
          );
        } else {
          throw new UserError(errorMessage);
        }
      }
    }

    // All required variables are set, continue with the middleware chain
    return next(context);
  };
}
