# MCP Middleware System

The middleware system allows you to intercept and modify tool and prompt executions. This enables cross-cutting concerns like tracking, logging, authorization, rate limiting, and more to be applied consistently across all components without modifying each individual implementation.

## How Middleware Works

Middleware functions are executed in a chain, with each middleware having the ability to:

1. Execute code before the tool or prompt runs
2. Modify the arguments
3. Execute code after execution
4. Modify the result
5. Handle errors from any component or other middleware

Each middleware receives a context object containing information about the current execution and a `next` function that continues the middleware chain.

## Creating Middleware

Middleware now uses generic interfaces to support both tools and prompts:

```typescript
type GenericMiddleware<T extends RegistryItemContext, R = any> =
  (context: T, next: (context: T) => Promise<R>) => Promise<R>;
```

Where `RegistryItemContext` is a common interface:

```typescript
interface RegistryItemContext {
  id: string;          // ID of the tool or prompt
  config: {            // Configuration of the registry item
    tracking?: boolean;   // Whether tracking is enabled
    envVars?: string[];   // Required environment variables
    [key: string]: any;   // Other configuration properties
  };
  args: any;          // Arguments passed to the item
  result?: any;       // Result returned by the item
}
```

This allows for specialized contexts like `ToolContext` and `PromptContext`:

### Example Middleware

Here's an example of a generic timing middleware that works with both tools and prompts:

```typescript
const createTimingMiddleware = <T extends RegistryItemContext, R = any>(): GenericMiddleware<T, R> => {
  return async (context, next) => {
    const startTime = Date.now();
    const itemType = 'promptId' in context ? 'prompt' : 'tool';
    const itemId = context.id;

    console.log(`Starting execution of ${itemType} ${itemId}`);

    try {
      // Call the next middleware in the chain
      const result = await next(context);

      const endTime = Date.now();
      console.log(`${itemType} ${itemId} completed in ${endTime - startTime}ms`);

      return result;
    } catch (error) {
      const endTime = Date.now();
      console.error(`${itemType} ${itemId} failed after ${endTime - startTime}ms`);
      throw error;
    }
  };
};
```

## Using Middleware

Register middleware with either registry using the `use` method:

```typescript
import { registry } from '../registry';               // Tool registry
import { promptRegistry } from '../registry/prompts';  // Prompt registry
import { createTimingMiddleware } from './timing-middleware';

// Register the middleware with both registries
registry.use(createTimingMiddleware());
promptRegistry.use(createTimingMiddleware());
```

Middleware functions are executed in the order they are registered. The built-in middlewares (env-validator and tracking) are registered automatically during initialization for both tools and prompts.

## Built-in Middleware

### Environment Variable Validator Middleware

The environment variable validator middleware checks if all required environment variables are set. It's automatically registered during initialization and validates any tool or prompt that specifies `envVars` in its configuration.

#### For Tools:
```typescript
@Tool({
  id: 'my-api-tool',
  name: 'myApiTool',
  description: 'A tool that uses an API',
  category: 'Web',
  parameters: MyApiToolSchema,
  envVars: ['API_KEY', 'API_URL']  // Required environment variables
})
export class MyApiTool implements ToolHandler {
  // ...
}
```

#### For Prompts:
```typescript
@Prompt({
  id: 'api-docs-prompt',
  name: 'API Documentation Prompt',
  description: 'Generates API documentation',
  category: 'Documentation',
  arguments: [...],
  envVars: ['OPENAPI_SPEC_PATH']  // Required environment variables
})
export class ApiDocsPrompt implements PromptHandler {
  // ...
}
```

If any of the specified environment variables are not set, the middleware will throw a `UserError` with a message indicating which variables are missing.

### Tracking Middleware

The tracking middleware records executions in the database. It's automatically registered during initialization and only tracks items that have `tracking: true` in their configuration.

#### For Tools:
```typescript
@Tool({
  id: 'my-tool',
  name: 'myTool',
  description: 'A helpful tool',
  category: 'Utility',
  parameters: MyToolSchema  // Enable tracking for this tool
})
export class MyTool implements ToolHandler {
  // ...
}
```

#### For Prompts:
```typescript
@Prompt({
  id: 'my-prompt',
  name: 'My Prompt',
  description: 'A helpful prompt template',
  category: 'Utility',
  arguments: [...]  // Enable tracking for this prompt
})
export class MyPrompt implements PromptHandler {
  // ...
}
```

## Creating Your Own Middleware

To create and use your own middleware:

1. Define a middleware function using the `GenericMiddleware` interface
2. Register it using `registry.use()` and/or `promptRegistry.use()`
3. Make sure to register it before calling `registerAllTools` or `registerAllPrompts`

```typescript
// Custom middleware factory
const createAuthMiddleware = <T extends RegistryItemContext, R = any>(): GenericMiddleware<T, R> => {
  return async (context, next) => {
    // Check if item requires auth
    if (context.config.requiresAuth && !isUserAuthenticated()) {
      throw new UserError('Authentication required');
    }

    // Continue with the chain
    return next(context);
  };
};

// Register your middleware with both registries
registry.use(createAuthMiddleware());
promptRegistry.use(createAuthMiddleware());
```

## Middleware Best Practices

1. **Keep middleware focused**: Each middleware should handle a single responsibility
2. **Handle errors properly**: Always catch errors and either handle them or re-throw them
3. **Chain order matters**: Middleware executes in registration order, with env-validator first and tracking second
4. **Modify context carefully**: Changes to the context are visible to downstream middleware
5. **Always call next()**: Unless you intentionally want to short-circuit the chain
6. **Use generics**: Create generic middleware that works with both tools and prompts
7. **Type compatibility**: Access common properties through the `RegistryItemContext` interface
8. **Handle both formats**: For backward compatibility, handle both old and new context formats