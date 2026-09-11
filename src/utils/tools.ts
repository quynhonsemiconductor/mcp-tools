import { z } from 'zod';
import { toolRegistry } from '../registry/tool-registry';
import { logError } from '../services/logger';
import { UserError } from '.';

/**
 * MCP Logger interface
 */
export interface ILogger {
  debug: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
}

/**
 * Resolves the tool ID for a given class instance by looking up its constructor in the tool registry.
 * Falls back to the constructor name if no registry match is found.
 */
function resolveToolId(instance: object): string {
  for (const [id, entry] of toolRegistry) {
    if (instance.constructor === entry.handlerClass) {
      return id;
    }
  }
  return instance.constructor.name;
}

/**
 * Converts an error into a JSON-serializable object.
 * Error properties (message, stack, name) are non-enumerable and are lost by JSON.stringify,
 * so we extract them explicitly.
 */
function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }
  return { error };
}

/**
 * Method decorator factory that creates a decorator to catch errors and convert them to UserError.
 * This decorator can be applied to methods in tool classes to automatically
 * handle error conversion for better user experience.
 *
 * @example
 * ```typescript
 * @Tool({...})
 * export class MyTool extends SomeTool {
 *   @CatchErrors()
 *   async execute(args: MyToolParams): Promise<string> {
 *     // Any error here will be caught and converted to UserError
 *     // No try/catch needed
 *     const result = await someOperation();
 *     return JSON.stringify(result);
 *   }
 * }
 * ```
 */
export const CatchErrors = function () {
  return function (
    target: object,
    key: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    // Store the original method
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

    // Replace with wrapped method that includes error handling
    descriptor.value = async function (this: object, ...args: unknown[]) {
      try {
        // Call the original method with all arguments
        return await originalMethod.apply(this, args);
      } catch (error) {
        const toolId = resolveToolId(this);

        // Handle different error types
        if (error instanceof UserError) {
          logError(
            `UserError caught in tool ${toolId} method ${String(key)}`,
            serializeError(error),
          );

          // If it's already a UserError, just rethrow it
          throw error;
        } else if (error instanceof z.ZodError) {
          logError(
            `ZodError caught in tool ${toolId} method ${String(key)}`,
            serializeError(error),
          );

          // Convert ZodError to UserError with the issues
          throw new UserError(
            `Tool execution error: ${error.issues.map((issue) => issue.message).join(', ')}`,
          );
        } else if (error instanceof Error) {
          logError(`Error caught in tool ${toolId} method ${String(key)}`, serializeError(error));

          let { message } = error;
          if (message.includes('403') || message.includes('401')) {
            message = `Authentication error: ${message}`;
          }

          throw new UserError(`Tool execution error: ${error.message}`);
        } else {
          logError(
            `Unexpected error caught in tool ${toolId} method ${String(key)}`,
            serializeError(error),
          );

          // Handle non-Error objects or primitives
          throw new UserError(`An unexpected error occurred during tool execution`);
        }
      }
    };

    // Return the modified descriptor
    return descriptor;
  };
};
