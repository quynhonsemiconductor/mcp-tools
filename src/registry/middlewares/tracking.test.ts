import { beforeEach, describe, expect, it, mock } from 'bun:test';

// Mock the database service
const mockRecordToolCall = mock(() => Promise.resolve());
const mockRecordRegistryCall = mock(() => Promise.resolve());

// Mock the database service module
void mock.module('../../services/db/index', () => ({
  default: {
    recordToolCall: mockRecordToolCall,
    recordRegistryCall: mockRecordRegistryCall,
  },
}));

// Mock the telemetry service
// Note: recordUsage is synchronous (returns void), not async
const mockRecordUsage = mock(() => {});

// Mock the telemetry service module before any imports that might use it
void mock.module('../../services/telemetry', () => ({
  default: {
    recordUsage: mockRecordUsage,
  },
}));

// Mock the logger service
const mockLogError = mock(() => {});
const mockLogDebug = mock(() => {});
void mock.module('../../services/logger', () => ({
  logError: mockLogError,
  logDebug: mockLogDebug,
}));

// Note: getAppVersion is mocked globally via setupStandardMocks() in test-utils/mocks.ts

// Now import the modules
import { PromptContext } from '../prompts/types';
import { ToolContext } from '../types';
import { createTrackingMiddleware } from './tracking';
import { RegistryItemContext } from './types';

describe('Tracking Middleware', () => {
  // Setup
  let mockToolContext: ToolContext;
  let mockPromptContext: PromptContext;
  let mockNext: any;
  const nextResult = { data: 'test result' };

  beforeEach(() => {
    // Reset mocks
    mockRecordToolCall.mockClear().mockImplementation(() => Promise.resolve());
    mockRecordRegistryCall.mockClear().mockImplementation(() => Promise.resolve());
    mockRecordUsage.mockClear().mockImplementation(() => {});
    mockLogError.mockClear();
    mockLogDebug.mockClear();

    // Create mock tool context and next function
    mockToolContext = {
      toolId: 'test-tool',
      toolConfig: {
        id: 'test-tool',
        name: 'testTool',
        description: 'Test tool',
        category: 'Utility',
        parameters: {},
      },
      args: { testParam: 'value' },

      // Add RegistryItemContext required properties
      id: 'test-tool',
      config: {
        id: 'test-tool',
        name: 'testTool',
        description: 'Test tool',
        category: 'Utility',
        parameters: {},
      },
    } as any;

    // Create mock prompt context
    mockPromptContext = {
      promptId: 'test-prompt',
      promptConfig: {
        id: 'test-prompt',
        name: 'testPrompt',
        description: 'Test prompt',
        category: 'Utility',
        arguments: [],
      },
      args: { inputText: 'test input' },

      // Add RegistryItemContext required properties
      id: 'test-prompt',
      config: {
        id: 'test-prompt',
        name: 'testPrompt',
        description: 'Test prompt',
        category: 'Utility',
        arguments: [],
      },
    } as any;

    mockNext = mock(async (context: RegistryItemContext) => {
      context.result = nextResult;
      return nextResult;
    });
  });

  describe('trackingMiddleware', () => {
    it('should track tool execution when tracking is enabled', async () => {
      // Set tracking to true
      (mockToolContext.toolConfig as any).tracking = true;
      (mockToolContext.config as any).tracking = true;

      // Execute middleware
      const result = await createTrackingMiddleware()(mockToolContext, mockNext);

      // Verify next was called
      expect(mockNext).toHaveBeenCalled();

      // Verify middleware returned correct result
      expect(result).toEqual(nextResult);

      // Verify database was called correctly
      expect(mockRecordRegistryCall).toHaveBeenCalledTimes(1);
      expect(mockRecordRegistryCall).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'test-tool',
          itemType: 'tool',
          payload: JSON.stringify({ testParam: 'value' }),
          status: 'success',
          result: JSON.stringify(nextResult),
        }),
      );
    });

    it('should track prompt execution when tracking is enabled', async () => {
      // Execute middleware with prompt context
      const result = await createTrackingMiddleware()(mockPromptContext, mockNext);

      // Verify next was called
      expect(mockNext).toHaveBeenCalled();

      // Verify middleware returned correct result
      expect(result).toEqual(nextResult);

      // Verify database was called correctly
      expect(mockRecordRegistryCall).toHaveBeenCalledTimes(1);
      expect(mockRecordRegistryCall).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'test-prompt',
          itemType: 'prompt',
          payload: JSON.stringify({ inputText: 'test input' }),
          status: 'success',
          result: JSON.stringify(nextResult),
        }),
      );
    });

    it('should record status=failure when tool result has isError=true (MCP error response)', async () => {
      // Gateway-routed MCPs (bundled/remote) catch errors internally and return
      // { content: [...], isError: true } instead of throwing. NR must see these
      // as failures, not successes.
      const mcpErrorResult = {
        content: [{ type: 'text', text: 'unable to get local issuer certificate' }],
        isError: true,
      };
      mockNext.mockImplementation(async (context: RegistryItemContext) => {
        context.result = mcpErrorResult;
        return mcpErrorResult;
      });

      const result = await createTrackingMiddleware()(mockToolContext, mockNext);

      expect(result).toEqual(mcpErrorResult);
      expect(mockRecordRegistryCall).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'test-tool',
          itemType: 'tool',
          status: 'failure',
          result: JSON.stringify(mcpErrorResult),
        }),
      );
    });

    it('should still record status=success when result has isError=false', async () => {
      const happyResult = {
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      };
      mockNext.mockImplementation(async (context: RegistryItemContext) => {
        context.result = happyResult;
        return happyResult;
      });

      await createTrackingMiddleware()(mockToolContext, mockNext);

      expect(mockRecordRegistryCall).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' }),
      );
    });

    it('should track errors when tool execution fails', async () => {
      // Make next throw an error
      const error = new Error('Test error');
      mockNext.mockImplementation(() => {
        throw error;
      });

      // Execute middleware and expect error
      try {
        await createTrackingMiddleware()(mockToolContext, mockNext);
        expect(false).toBe(true); // Should not reach here
      } catch (err) {
        expect(err).toBe(error);

        // Verify database was called with error info
        expect(mockRecordRegistryCall).toHaveBeenCalledTimes(1);
        expect(mockRecordRegistryCall).toHaveBeenCalledWith(
          expect.objectContaining({
            itemId: 'test-tool',
            itemType: 'tool',
            payload: JSON.stringify({ testParam: 'value' }),
            status: 'failure',
            result: 'Test error',
          }),
        );
      }
    });

    it('should track errors when prompt execution fails', async () => {
      // Make next throw an error
      const error = new Error('Test prompt error');
      mockNext.mockImplementation(() => {
        throw error;
      });

      // Execute middleware and expect error
      try {
        await createTrackingMiddleware()(mockPromptContext, mockNext);
        expect(false).toBe(true); // Should not reach here
      } catch (err) {
        expect(err).toBe(error);

        // Verify database was called with error info
        expect(mockRecordRegistryCall).toHaveBeenCalledTimes(1);
        expect(mockRecordRegistryCall).toHaveBeenCalledWith(
          expect.objectContaining({
            itemId: 'test-prompt',
            itemType: 'prompt',
            payload: JSON.stringify({ inputText: 'test input' }),
            status: 'failure',
            result: 'Test prompt error',
          }),
        );
      }
    });

    it('should handle database errors gracefully for tools', async () => {
      // Make database recording throw an error
      mockRecordRegistryCall.mockImplementation(() => {
        throw new Error('Database error');
      });

      // Execute middleware
      const result = await createTrackingMiddleware()(mockToolContext, mockNext);

      // Verify middleware returned correct result despite DB error
      expect(result).toEqual(nextResult);

      // Verify error was logged using logError but didn't break execution
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to record registry call to local database',
        expect.objectContaining({
          error: 'Database error',
          itemType: 'tool',
        }),
      );
    });

    it('should handle database errors gracefully for prompts', async () => {
      // Make database recording throw an error
      mockRecordRegistryCall.mockImplementation(() => {
        throw new Error('Database error');
      });

      // Execute middleware
      const result = await createTrackingMiddleware()(mockPromptContext, mockNext);

      // Verify middleware returned correct result despite DB error
      expect(result).toEqual(nextResult);

      // Verify error was logged using logError but didn't break execution
      expect(mockLogError).toHaveBeenCalledWith(
        'Failed to record registry call to local database',
        expect.objectContaining({
          error: 'Database error',
          itemType: 'prompt',
        }),
      );
    });

    it('should include tracking when middleware is created from factory for tools', async () => {
      // Create middleware using factory function
      const middleware = createTrackingMiddleware();

      // Execute middleware
      await middleware(mockToolContext, mockNext);

      // Verify database was called
      expect(mockRecordRegistryCall).toHaveBeenCalled();
    });

    it('should include tracking when middleware is created from factory for prompts', async () => {
      // Create middleware using factory function
      const middleware = createTrackingMiddleware();

      // Execute middleware
      await middleware(mockPromptContext, mockNext);

      // Verify database was called
      expect(mockRecordRegistryCall).toHaveBeenCalled();
    });

    it('should properly detect item type from context', async () => {
      // Create mixed context with both tool and prompt properties
      const mixedContext = {
        ...mockToolContext,
        promptId: 'mixed-id',
      };

      // Execute middleware
      await createTrackingMiddleware()(mixedContext, mockNext);

      // Verify it was processed as a tool (toolId takes precedence)
      expect(mockRecordRegistryCall).toHaveBeenCalledWith(
        expect.objectContaining({
          itemType: 'tool',
        }),
      );
    });
  });
});
