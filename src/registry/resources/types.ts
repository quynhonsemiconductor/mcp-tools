import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.d.ts';
import { RegistryItemContext } from '../middlewares/types';

/** Available resource categories */
export type ResourceCategories =
  | 'Documentation'
  | 'Code'
  | 'Reference'
  | 'Data'
  | 'Log'
  | 'Configuration';

export type ResourceLoadFunction = (uri: URL, variables: Variables) => Promise<string>;

export interface ResourceContext extends RegistryItemContext {
  resourceId: string; // Corresponds to id in RegistryItemContext
  resourceConfig: ResourceConfig; // Corresponds to config in RegistryItemContext
  uri: URL; // The full URI of the resource call, including any variables
  args: Variables;
  result?: string;

  // Implementation of RegistryItemContext properties
  id: string;
  config: ResourceConfig;
}

export type ResourceMiddleware = (
  context: ResourceContext,
  next: (context: ResourceContext) => Promise<string>,
) => Promise<string>;

// Interface for resource configurations
export interface ResourceArgument {
  name: string;
  description?: string;
  required?: boolean;
  complete?: (value: string) => Promise<{ values: string[]; hasMore?: boolean; total?: number }>;
}

export interface ResourceConfig {
  id: string; // Unique identifier for the resource
  name: string; // Name of the resource as exposed to MCP
  description: string; // Description of what the resource does
  category: ResourceCategories; // Category for grouping resources
  arguments?: ResourceArgument[]; // Array of argument objects
}

// Interface that all resource classes must implement
export interface ResourceHandler {
  load(uri: URL, variables?: Variables): Promise<string>;
}

// Type for constructor that creates a ResourceHandler
export type ResourceConstructor = new () => ResourceHandler;
