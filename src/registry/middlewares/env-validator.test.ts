import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { MockUserError, setupStandardMocks } from '../../test-utils/mocks';
const { setMockedEnvVar } = setupStandardMocks();

// Create mock env with some test variables
setMockedEnvVar('TEST_API_KEY', 'test-key');
setMockedEnvVar('TEST_API_URL', 'https://test.com');
setMockedEnvVar('EMPTY_VALUE', '');

// Now import modules
import { ToolContext } from '..';
import { createEnvValidatorMiddleware } from './env-validator';

describe('Environment Validator Middleware', () => {
  // Setup
  let mockContext: ToolContext;
  let mockNext: any;

  beforeEach(() => {
    // Create mock context and next function
    mockContext = {
      toolId: 'test-tool',
      toolConfig: {
        id: 'test-tool',
        name: 'testTool',
        description: 'Test tool',
        // Deliberately a generic category: this fixture only needs *some* valid
        // ToolCategories value, and naming a real service means the next
        // decommission breaks the typecheck here (it previously used 'Salesforce').
        category: 'Utility',
        parameters: {} as any,
        envVars: ['TEST_API_KEY', 'TEST_API_URL'] as any,
      },
      // Add config alias as per ToolContext interface
      config: {
        id: 'test-tool',
        name: 'testTool',
        description: 'Test tool',
        // Deliberately a generic category: this fixture only needs *some* valid
        // ToolCategories value, and naming a real service means the next
        // decommission breaks the typecheck here (it previously used 'Salesforce').
        category: 'Utility',
        parameters: {} as any,
        envVars: ['TEST_API_KEY', 'TEST_API_URL'] as any,
      },
      args: { testParam: 'value' },
      id: 'test-tool', // Add id property as per RegistryItemContext interface
    };

    mockNext = mock(async (_context: ToolContext) => {
      return { success: true };
    });
  });

  describe('envValidatorMiddleware', () => {
    it('should allow execution when all required env vars are set', async () => {
      // All required vars are set in the mock
      const result = await createEnvValidatorMiddleware()(mockContext, mockNext);

      // Should call next and return result
      expect(mockNext).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should throw UserError when env var is missing', async () => {
      // Add missing env var to requirements
      mockContext.toolConfig.envVars = ['TEST_API_KEY', 'MISSING_VAR'] as any;

      // Expect error when executing
      let error: Error | undefined;
      try {
        await createEnvValidatorMiddleware()(mockContext, mockNext);
      } catch (err: any) {
        error = err;
      }

      // Verify error details
      expect(error).toBeInstanceOf(MockUserError);
      expect(error?.message).toContain('Missing required environment variables');
      expect(error?.message).toContain('MISSING_VAR');
      expect(error?.message).toContain('testTool');

      // Should not call next
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw UserError when env var is empty', async () => {
      // Add empty env var to requirements
      mockContext.toolConfig.envVars = ['TEST_API_KEY', 'EMPTY_VALUE'] as any;

      // Expect error when executing
      let error: Error | undefined;
      try {
        await createEnvValidatorMiddleware()(mockContext, mockNext);
      } catch (err: any) {
        error = err;
      }

      // Verify error details
      expect(error).toBeInstanceOf(MockUserError);
      expect(error?.message).toContain('Missing required environment variables');
      expect(error?.message).toContain('EMPTY_VALUE');

      // Should not call next
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should not validate when no env vars are required', async () => {
      // Remove env vars requirement
      mockContext.toolConfig.envVars = [];

      // Execute middleware
      const result = await createEnvValidatorMiddleware()(mockContext, mockNext);

      // Should call next and return result
      expect(mockNext).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should handle undefined envVars in tool config', async () => {
      // Set envVars to undefined
      delete mockContext.toolConfig.envVars;

      // Execute middleware
      const result = await createEnvValidatorMiddleware()(mockContext, mockNext);

      // Should call next and return result
      expect(mockNext).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should include all missing vars in error message', async () => {
      // Add multiple missing vars
      mockContext.toolConfig.envVars = ['MISSING_1', 'TEST_API_KEY', 'MISSING_2'] as any;

      // Expect error when executing
      let error: Error | undefined;
      try {
        await createEnvValidatorMiddleware()(mockContext, mockNext);
      } catch (err: any) {
        error = err;
      }

      // Verify error contains all missing vars
      expect(error?.message).toContain('MISSING_1');
      expect(error?.message).toContain('MISSING_2');
      expect(error?.message).not.toContain('TEST_API_KEY');
    });

    it('should include middleware when created from factory', async () => {
      // Create middleware from factory
      const middleware = createEnvValidatorMiddleware();

      // Remove env vars requirement for successful test
      mockContext.toolConfig.envVars = ['TEST_API_KEY'] as any;

      // Execute middleware
      const result = await middleware(mockContext, mockNext);

      // Should work the same as direct middleware
      expect(mockNext).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });
});
