// We no longer need zod for prompt arguments
import { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { RegistryItemContext } from '../middlewares/types';

/** Available prompt categories */
export type PromptCategories = 'Documentation' | 'Code' | 'Analysis' | string;

export type PromptSource = 'qnsc-mcp' | 'git';

// The `args` parameter is intentionally `any`: prompt handlers declare their
// own concrete argument shapes (e.g. `{ input: string }`) and are passed here
// via `PromptHandler.load` bindings. A `unknown`/generic parameter would break
// that contravariant assignment at the (external) registration call sites. The
// return type is tightened to `Promise<string>` since every handler resolves a
// rendered prompt string.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PromptLoadFunction = (args: any) => Promise<string>;

export interface PromptContext extends RegistryItemContext {
  promptId: string; // Corresponds to id in RegistryItemContext
  promptConfig: PromptConfig; // Corresponds to config in RegistryItemContext
  args: unknown;
  result?: string;

  // Implementation of RegistryItemContext properties
  id: string;
  config: PromptConfig;
}

export type PromptMiddleware = (
  context: PromptContext,
  next: (context: PromptContext) => Promise<string>,
) => Promise<string>;

export interface PromptConfig {
  id: string; // Unique identifier for the prompt (may be org-scoped for external prompts)
  originalId?: string; // Original prompt ID from the source (for external prompts)
  name: string; // Name of the prompt as exposed to MCP
  description: string; // Description of what the prompt does
  category: PromptCategories; // Category for grouping prompts
  arguments: ZodRawShapeCompat; // Array of argument objects
  sourceType?: PromptSource;
  sourcePath?: string;
  excludeByDefault?: boolean;
  requiredTools?: string[];
}

// Interface that all prompt classes must implement
export interface PromptHandler {
  load(args: unknown): Promise<string>;
}

// Type for constructor that creates a PromptHandler
export type PromptConstructor = new () => PromptHandler;
