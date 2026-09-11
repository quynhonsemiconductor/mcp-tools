import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import {
  ServerNotification,
  ServerRequest,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { EnvVarSchema } from '../env';
import { RegistryItemContext } from './middlewares/types';

/** Available tool categories, friendly name -> category directory name */
export const ToolCategoryMap = {
  Bundled: 'bundled',
  CIP: 'cip',
  CrUX: 'crux',
  Dart: 'dart',
  'Github: Actions': 'github',
  'Github: Dependabot': 'github',
  'Github: Discussions': 'github',
  'Github: Gists': 'github',
  'Github: Repos': 'github',
  'Github: Branches': 'github',
  'Github: Issues': 'github',
  'Github: Orgs': 'github',
  'Github: Projects': 'github',
  'Github: Pulls': 'github',
  'Github: Releases': 'github',
  'Github: Search': 'github',
  'Github: Wiki': 'github',
  'Knowledge Graph': 'knowledge-graph',
  k6: 'k6',
  Kong: 'kong',
  Memory: 'memory',
  NPM: 'npm',
  PostgreSQL: 'postgresql',
  Slack: 'slack',
  Swagger: 'swagger',
  Utility: 'util',
  Web: 'web',
  Remote: 'remote', // Category for all remote MCP tools
  Local: 'local', // Category for all local MCP tools
  Uncategorized: 'uncategorized', // Category for all uncategorized MCP tools
} as const;

export type ToolCategories = keyof typeof ToolCategoryMap;

/**
 * Canonical category names for non-native tool sources, typed against
 * ToolCategoryMap so a rename of the underlying key breaks the build here
 * instead of silently desyncing the string literals scattered across
 * gateway/registry/command files that filter or display these categories.
 */
export const BUNDLED_CATEGORY: ToolCategories = 'Bundled';
export const REMOTE_CATEGORY: ToolCategories = 'Remote';
export const LOCAL_CATEGORY: ToolCategories = 'Local';

export type ToolExecuteFunction = (
  args: unknown,
  ctx?: RequestHandlerExtra<ServerRequest, ServerNotification>,
) => Promise<unknown>;

export interface ToolContext extends RegistryItemContext {
  toolId: string; // Corresponds to id in RegistryItemContext
  toolConfig: ToolConfig; // Corresponds to config in RegistryItemContext
  // Deliberately `any`: the registry populates this from an `unknown` tool-args
  // value (tool-registry.ts) while middlewares mutate arbitrary members on it
  // (e.g. redaction). No single stricter type satisfies both the
  // `unknown`-source assignment and the member mutation without changing those
  // call sites. `RegistryItemContext.args` (unknown) remains the type-safe
  // surface middlewares should prefer to read from.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  result?: unknown;

  // Implementation of RegistryItemContext properties
  id: string;
  config: ToolConfig;
}

export type ToolMiddleware = (
  context: ToolContext,
  next: (context: ToolContext) => Promise<unknown>,
) => Promise<unknown>;

export type ToolProvider = 'native' | 'bundled' | 'remote' | 'local';

// Interface for tool configurations
export interface ToolConfig {
  id: string; // Unique identifier for the tool
  name: string; // Name of the tool as exposed to MCP
  description: string; // Description of what the tool does
  category: ToolCategories; // Category for grouping tools
  parameters: z.ZodType; // Zod schema defining the parameters
  envVars?: Array<keyof EnvVarSchema>; // Environment variables required for the tool (must be valid env keys)
  optionalEnvVars?: Array<keyof EnvVarSchema>; // Optional environment variables that can enhance the tool's functionality but are not strictly required (must be valid env keys)
  version?: string; // Optional version information
  annotations?: ToolAnnotations;
  includeByDefault?: boolean; // Whether to include this tool by default (defaults to false if not specified)
  provider?: ToolProvider; // How the tool is provided (defaults to 'native')
}

// Interface that all tool classes must implement
export interface ToolHandler {
  // Declared as a method (not a `ToolExecuteFunction` property) so concrete
  // tools can narrow `args` to their own validated parameter type. Method
  // parameters are checked bivariantly, which keeps those specialized
  // signatures assignable here without falling back to `any`.
  execute(
    args: unknown,
    ctx?: RequestHandlerExtra<ServerRequest, ServerNotification>,
  ): Promise<unknown>;
  isEnabled?(config: ToolConfig): boolean;
}

// Type for constructor that creates a ToolHandler
export type ToolConstructor = new () => ToolHandler;
