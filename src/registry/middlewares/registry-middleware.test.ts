import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { setupStandardMocks } from '../../test-utils/mocks';
setupStandardMocks();

// Create a custom mockMcpServer for this test file with a proper registerTool implementation
const mockRegisterTool = mock((name, tool, _func) => {
  // Store the tool for middleware tests
  return tool;
});

const mockMcpServer = {
  on: mock(() => {}),
  registerTool: mockRegisterTool,
  start: mock(() => Promise.resolve()),
};

import type { ToolContext, ToolMiddleware } from '../types';

// Now import the tools
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistryManager } from '../tool-registry';

// Add a custom loadConfig mock to ensure our test tool is included
void mock.module('../../config', () => ({
  defaultConfig: {},
  loadConfig: () => ({
    tools: {
      include: ['test-tool'],
    },
  }),
}));

function createMockServer() {
  // Return our custom mock instead of using the default one
  return mockMcpServer as unknown as McpServer;
}

describe('Tool Registry Middleware', () => {
  let registry: ToolRegistryManager;
  let mockExecute: any;
  let mockTool: any;

  beforeEach(async () => {
    // Reset mocks
    mockRegisterTool.mockClear();

    // Create a fresh registry for each test
    registry = new ToolRegistryManager();
    await registry.initialize(true);

    // Reset the registry to remove built-in middlewares for testing
    registry.resetRegistry();

    // Create a mock tool
    mockExecute = mock((args: any) => Promise.resolve(`Result: ${JSON.stringify(args)}`));

    mockTool = {
      config: {
        id: 'test-tool',
        name: 'testTool',
        description: 'A test tool',
        category: 'Testing',
        parameters: {},
        includeByDefault: true, // Add this to ensure the tool is included
      },
      handlerClass: class TestTool {
        execute = mockExecute;
      },
    };
  });

  describe('Middleware Registration', () => {
    it('should register middleware with the use method', () => {
      const middleware: ToolMiddleware = async (context, next) => next(context);

      // Test middleware registration
      registry.use(middleware);

      // Trigger the middleware chain by registering a tool
      const server = createMockServer();
      registry.registerTool('test-tool', mockTool.config, mockTool.handlerClass);
      registry.registerAllTools(server);

      // Verify tool was registered
      expect(mockRegisterTool).toHaveBeenCalled();
    });

    it('should clear middlewares when resetRegistry is called', () => {
      const middleware = mock(async (context: ToolContext, next: any) => next(context));
      registry.use(middleware as any);

      // Reset the registry
      registry.resetRegistry();

      // Register a tool and verify the middleware doesn't run
      const server = createMockServer();
      registry.registerTool('test-tool', mockTool.config, mockTool.handlerClass);
      registry.registerAllTools(server);

      expect(middleware).not.toHaveBeenCalled();
    });
  });

  describe('Middleware Chain', () => {
    it('should execute middlewares in the correct order', async () => {
      // Create an array to track execution order
      const executionOrder: string[] = [];

      // Create middlewares that record their execution
      const middleware1: ToolMiddleware = async (context, next) => {
        executionOrder.push('before-1');
        const result = await next(context);
        executionOrder.push('after-1');
        return result;
      };

      const middleware2: ToolMiddleware = async (context, next) => {
        executionOrder.push('before-2');
        const result = await next(context);
        executionOrder.push('after-2');
        return result;
      };

      // Register middlewares
      registry.use(middleware1);
      registry.use(middleware2);

      // Create server and register tool
      const server = createMockServer();
      registry.registerTool('test-tool', mockTool.config, mockTool.handlerClass);
      registry.registerAllTools(server);

      // Get the registered execute function from the mock
      const executeFunction = mockRegisterTool.mock.calls[0][2];

      // Execute the function and verify order
      await executeFunction({ param: 'value' });

      // Check execution order
      expect(executionOrder).toEqual(['before-1', 'before-2', 'after-2', 'after-1']);
    });

    it('should allow middlewares to modify context', async () => {
      // Create middleware that modifies context
      const modifyingMiddleware: ToolMiddleware = async (context, next) => {
        // Add data to context
        context.args.modifiedBy = 'middleware';
        return next(context);
      };

      // Register middleware
      registry.use(modifyingMiddleware);

      // Register tool and get execute function
      const server = createMockServer();
      registry.registerTool('test-tool', mockTool.config, mockTool.handlerClass);
      registry.registerAllTools(server);

      const executeFunction = mockRegisterTool.mock.calls[0][2];

      // Execute the function
      await executeFunction({ param: 'value' });

      // Verify args were modified
      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          param: 'value',
          modifiedBy: 'middleware',
        }),
        undefined,
      );
    });

    it('should allow middlewares to modify results', async () => {
      // Create middleware that modifies the result
      const resultModifier: ToolMiddleware = async (context, next) => {
        const result = await next(context);
        return `Modified: ${result}`;
      };

      // Register middleware
      registry.use(resultModifier);

      // Register tool and get execute function
      const server = createMockServer();
      registry.registerTool('test-tool', mockTool.config, mockTool.handlerClass);
      registry.registerAllTools(server);

      const executeFunction = mockRegisterTool.mock.calls[0][2];

      // Execute the function and verify result
      const result = await executeFunction({ param: 'value' });
      const text = result.content[0].text;
      expect(text).toContain('Modified:');
      expect(text).toContain('Result:');
    });

    it('should allow middlewares to handle errors', async () => {
      // Make the tool throw an error
      const error = new Error('Tool error');
      mockExecute.mockImplementation(() => {
        throw error;
      });

      // Create error handling middleware
      const errorHandler: ToolMiddleware = async (context, next) => {
        try {
          return await next(context);
        } catch {
          return 'Error was handled';
        }
      };

      // Register middleware
      registry.use(errorHandler);

      // Register tool and get execute function
      const server = createMockServer();
      registry.registerTool('test-tool', mockTool.config, mockTool.handlerClass);
      registry.registerAllTools(server);

      const executeFunction = mockRegisterTool.mock.calls[0][2];

      // Execute the function and check the error was handled
      const result = await executeFunction({ param: 'value' });
      expect(result.content[0].text).toBe('Error was handled');
    });

    it('should allow middlewares to short-circuit the chain', async () => {
      // Create short-circuiting middleware
      const shortCircuit: ToolMiddleware = async (_context, _next) => {
        // Skip calling next and return directly
        return 'Short-circuited';
      };

      // Register middleware
      registry.use(shortCircuit);

      // Register tool and get execute function
      const server = createMockServer();
      registry.registerTool('test-tool', mockTool.config, mockTool.handlerClass);
      registry.registerAllTools(server);

      const executeFunction = mockRegisterTool.mock.calls[0][2];

      // Execute the function
      const result = await executeFunction({ param: 'value' });

      // Verify short-circuit occurred
      expect(result.content[0].text).toBe('Short-circuited');
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });
});
