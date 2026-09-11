import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { setupStandardMocks } from '../test-utils/mocks';
import { z } from 'zod';
const { mockPromptRegistry, mockRegistry: _mockRegistry } = setupStandardMocks();

// Mock prompt handler class
class MockPromptHandler {
  async load(_args: Record<string, any>): Promise<string> {
    return 'Mock prompt template content';
  }
}

import { getPrompt } from './get-prompt';

describe('Get Prompt Command', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  // Sample prompt data for testing
  // arguments is a ZodRawShapeCompat (object of Zod schemas), matching what the
  // markdown parser produces and getPromptById returns — NOT the frontmatter array.
  const mockPrompt = {
    id: 'test-prompt',
    name: 'Test Prompt',
    description: 'A test prompt for testing',
    category: 'testing',
    arguments: {
      arg1: z.string().describe('First argument'),
      arg2: z.string().describe('Second argument').optional(),
    },
  };

  const mockPromptWithoutArgs = {
    id: 'simple-prompt',
    name: 'Simple Prompt',
    description: 'A simple prompt without arguments',
    category: 'testing',
    arguments: {},
  };

  beforeEach(() => {
    // Mock console.log
    consoleLogSpy = spyOn(console, 'log'); //.mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    // Reset all mocks
    mockPromptRegistry.initialize.mockClear().mockImplementation(() => Promise.resolve());
    mockPromptRegistry.getAllPrompts.mockClear().mockImplementation(() => [mockPrompt]);
    mockPromptRegistry.getCategories.mockClear().mockImplementation(() => ['testing']);
    mockPromptRegistry.getPromptById.mockClear().mockImplementation(() => null);
    mockPromptRegistry.getFromRegistry.mockClear().mockImplementation(
      () =>
        ({
          config: mockPrompt,
          handlerClass: MockPromptHandler,
        }) as any,
    );
  });

  afterEach(() => {
    // Restore all mocks
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('getPrompt', () => {
    it('should display prompt details when prompt is found', async () => {
      mockPromptRegistry.getPromptById.mockImplementation(() => mockPrompt);

      await getPrompt('test-prompt');

      // Verify registry methods were called
      expect(mockPromptRegistry.getFromRegistry).toHaveBeenCalled();
      expect(mockPromptRegistry.getAllPrompts).toHaveBeenCalled();
      expect(mockPromptRegistry.getCategories).toHaveBeenCalled();
      expect(mockPromptRegistry.getPromptById).toHaveBeenCalledWith('test-prompt');

      // Verify prompt details are displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[test-prompt] Test Prompt:'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('A test prompt for testing'),
      );

      // Verify arguments are displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Arguments:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('• arg1 (required): First argument'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('• arg2 (optional): Second argument'),
      );

      // Verify prompt template is displayed
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Prompt Template:'));
      expect(consoleLogSpy).toHaveBeenCalledWith('Mock prompt template content');
    });

    it('should display "None" for arguments when prompt has no arguments', async () => {
      mockPromptRegistry.getPromptById.mockImplementation(() => mockPromptWithoutArgs);

      await getPrompt('simple-prompt');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Arguments:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('None'));
    });

    it('should display error message when prompt is not found', async () => {
      mockPromptRegistry.getPromptById.mockImplementation(() => null);

      await getPrompt('nonexistent-prompt');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '❌ Prompt with ID "nonexistent-prompt" not found.',
      );
    });

    it('should handle prompt template loading errors gracefully', async () => {
      mockPromptRegistry.getPromptById.mockImplementation(() => mockPrompt);
      mockPromptRegistry.getFromRegistry.mockImplementation(() => null);

      await getPrompt('test-prompt');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '❌ Could not load prompt content - handler not found',
      );
    });
  });
});
