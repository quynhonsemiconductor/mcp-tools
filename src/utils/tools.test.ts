import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { z } from 'zod';
import { toolRegistry } from '../registry/tool-registry';
import { UserError } from '.';
import { CatchErrors } from './tools';

// Capture logError calls for verification
const logErrorCalls: Array<{ message: string; data: any }> = [];
void mock.module('../services/logger', () => ({
  logError: (message: string, data?: any) => {
    logErrorCalls.push({ message, data });
  },
  logDebug: () => {},
  logInfo: () => {},
  logWarn: () => {},
}));

describe('Tools Utilities', () => {
  describe('CatchErrors Decorator', () => {
    beforeEach(() => {
      logErrorCalls.length = 0;
    });

    // Test class to validate the decorator
    class TestClass {
      @CatchErrors()
      async methodThatThrows(): Promise<void> {
        throw new Error('Test error');
      }

      @CatchErrors()
      async methodThatThrowsUserError(): Promise<void> {
        throw new UserError('Already a UserError');
      }

      @CatchErrors()
      async methodThatThrowsZodError(): Promise<void> {
        throw new z.ZodError([
          {
            code: 'invalid_type',
            expected: 'string',
            received: 'number',
            path: ['field'],
            message: 'Expected string, received number',
          },
        ] as any);
      }

      @CatchErrors()
      async methodThatThrowsNonError(): Promise<void> {
        const nonError: unknown = 'String error'; // Not an Error instance
        throw nonError;
      }

      @CatchErrors()
      async methodThatSucceeds(): Promise<string> {
        return 'Success';
      }
    }

    it('should convert regular Error to UserError', async () => {
      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrows();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
        expect((error as UserError).message).toBe('Tool execution error: Test error');
      }
    });

    it('should pass through existing UserError', async () => {
      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrowsUserError();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
        expect((error as UserError).message).toBe('Already a UserError');
      }
    });

    it('should handle ZodError conversion', async () => {
      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrowsZodError();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
        expect((error as UserError).message).toBe(
          'Tool execution error: Expected string, received number',
        );
      }
    });

    it('should handle non-Error objects', async () => {
      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrowsNonError();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
        expect((error as UserError).message).toBe(
          'An unexpected error occurred during tool execution',
        );
      }
    });

    it('should not interfere with successful execution', async () => {
      const testInstance = new TestClass();

      const result = await testInstance.methodThatSucceeds();
      expect(result).toBe('Success');
    });

    it('should use tool ID from registry instead of class name', async () => {
      // Register TestClass in the tool registry with a known ID
      toolRegistry.set('test-tool-id', {
        config: {
          id: 'test-tool-id',
          name: 'Test Tool',
          description: 'A test tool',
          category: 'Utility',
          parameters: z.object({}),
        } as any,
        handlerClass: TestClass as any,
      });

      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrows();
        expect(true).toBe(false);
      } catch {
        // Expected
      }

      expect(logErrorCalls.length).toBe(1);
      expect(logErrorCalls[0].message).toContain('test-tool-id');
      expect(logErrorCalls[0].message).not.toContain('TestClass');

      // Clean up
      toolRegistry.delete('test-tool-id');
    });

    it('should fall back to class name when not in registry', async () => {
      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrows();
        expect(true).toBe(false);
      } catch {
        // Expected
      }

      expect(logErrorCalls.length).toBe(1);
      expect(logErrorCalls[0].message).toContain('TestClass');
    });

    it('should serialize error with message, name, and stack', async () => {
      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrows();
        expect(true).toBe(false);
      } catch {
        // Expected
      }

      expect(logErrorCalls.length).toBe(1);
      const errorData = logErrorCalls[0].data;
      expect(errorData).toHaveProperty('message', 'Test error');
      expect(errorData).toHaveProperty('name', 'Error');
      expect(errorData).toHaveProperty('stack');
      expect(errorData.stack).toContain('Test error');
    });

    it('should serialize non-Error values as { error }', async () => {
      const testInstance = new TestClass();

      try {
        await testInstance.methodThatThrowsNonError();
        expect(true).toBe(false);
      } catch {
        // Expected
      }

      expect(logErrorCalls.length).toBe(1);
      const errorData = logErrorCalls[0].data;
      expect(errorData).toEqual({ error: 'String error' });
    });
  });
});
