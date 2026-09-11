/**
 * Shared types for middleware functionality across tools and prompts
 */

/**
 * Source type for tools and prompts
 */
export type ToolSource = 'first-party' | 'second-party' | 'third-party';

/**
 * Base context interface that tool and prompt contexts can extend
 * This provides the common fields that middlewares need to work with
 * regardless of whether they're operating on tools or prompts
 *
 * NOTE: When implementing middlewares, be aware that specific context types
 * (ToolContext, PromptContext) may use specialized properties like 'toolConfig'
 * or 'promptConfig' alongside the generic 'config' property defined here.
 *
 * For maximum compatibility, middlewares should use the utility function getConfigFromContext:
 *
 * const config = getConfigFromContext(context);
 */
/**
 * The minimal shape of a registry item's configuration that middlewares read.
 * Both ToolConfig and PromptConfig are structurally assignable to this — it
 * declares only the (optional) fields middlewares actually consume, so it
 * stays compatible with the richer, more specific config types without
 * resorting to `any`.
 */
export interface RegistryItemConfig {
  id?: string; // Identifier of the tool or prompt
  name?: string; // Display name
  envVars?: string[]; // Required environment variables
  provider?: string; // How the item is provided (e.g. 'native', 'bundled')
  category?: string; // Category used for analytics/segmentation
}

export interface RegistryItemContext {
  id: string; // ID of the tool or prompt
  config: RegistryItemConfig;
  args: unknown; // Arguments passed to the tool or prompt
  ctx?: RequestHandlerExtra<ServerRequest, ServerNotification>; // Optional context from the request handler, may contain metadata and other info
  result?: unknown; // Result returned by the tool or prompt
  source?: ToolSource; // Source of the tool (first-party, second-party, third-party)
}

/**
 * Generic middleware type that works with any context
 * @template T - The type of context (must extend RegistryItemContext)
 * @template R - The return type of the middleware chain
 */
export type GenericMiddleware<T extends RegistryItemContext, R = unknown> = (
  context: T,
  next: (context: T) => Promise<R>,
) => Promise<R>;

/**
 * Utility function to safely extract configuration from context objects
 * This handles both specific context types (ToolContext, PromptContext) and the generic RegistryItemContext
 *
 * @param context - The context object from which to extract config
 * @returns The configuration object
 */
export function getConfigFromContext<T extends RegistryItemContext>(
  context: T,
): RegistryItemConfig {
  // Check for specific context types first, then fall back to generic config
  if ('toolConfig' in context) {
    return (context as { toolConfig: RegistryItemConfig }).toolConfig;
  } else if ('promptConfig' in context) {
    return (context as { promptConfig: RegistryItemConfig }).promptConfig;
  } else {
    return context.config;
  }
}

import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
/**
 * Types for tracking functionality
 */

// Types now defined in services/db/types.ts
import { CallStatus, ItemType } from '../../services/db/types';

/**
 * Status of a registry item call (tool or prompt)
 * @deprecated Use CallStatus from services/db/types.ts instead
 */
export type RegistryCallStatus = CallStatus;

/**
 * Type of registry item
 * @deprecated Use ItemType from services/db/types.ts instead
 */
export type RegistryItemType = ItemType;

/**
 * Interface for registry item call records
 * Used for tracking both tool and prompt executions
 * @deprecated Use RegistryCall from services/db/types.ts instead
 */
export interface RegistryCall {
  id?: number; // Database ID (auto-assigned)
  itemId: string; // ID of the tool or prompt
  itemType: RegistryItemType; // Type of item (tool or prompt)
  payload: string; // Serialized arguments
  runTimeMs: number; // Execution time in milliseconds
  status?: RegistryCallStatus; // Success or failure
  result?: string; // Serialized result or error message
  timestamp?: number; // Timestamp of the call
}
