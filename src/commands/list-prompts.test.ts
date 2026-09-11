import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { setupStandardMocks } from '../test-utils/mocks';

// Mock update-utils
const mockNotifyIfUpdateAvailable = mock(() => Promise.resolve());
void mock.module('../utils/update-utils', () => ({
  notifyIfUpdateAvailable: mockNotifyIfUpdateAvailable,
}));

import { listPrompts } from './list-prompts';

const { mockLoadConfig, mockDisplay, mockPromptRegistry, mockRegistry: _mockRegistry } = setupStandardMocks();
const {
  displayHeader: mockDisplayHeader,
  displayError: mockDisplayError,
  bold: mockBold,
  dim: mockDim,
} = mockDisplay;

const {
  initialize: mockInitialize,
  getAllPrompts: mockGetAllPrompts,
  getCategories: mockGetCategories,
  getPromptsByCategory: mockGetPromptsByCategory,
  getPromptSources: _mockGetPromptSources,
} = mockPromptRegistry;

describe('List Prompts Command', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;
  const originalProcessArgv = process.argv;

  // Sample data for testing
  const mockPrompts = [
    {
      id: 'prompt1',
      name: 'Alpha Prompt',
      description: 'Description for prompt 1',
      category: 'category1',
      arguments: [],
    },
    {
      id: 'prompt2',
      name: 'Beta Prompt',
      description: 'Description for prompt 2',
      category: 'category1',
      arguments: [],
    },
    {
      id: 'prompt3',
      name: 'Gamma Prompt',
      description: 'Description for prompt 3',
      category: 'category2',
      arguments: [],
      sourcePath: 'qnsc-mcp',
    },
    {
      id: 'prompt4',
      name: 'Delta Prompt',
      description: 'Description for prompt 4',
      category: 'category2',
      arguments: [],
      sourcePath: 'external-repo',
    },
    {
      id: 'prompt5',
      name: 'Epsilon Prompt',
      description: 'Description for prompt 5',
      category: 'category3',
      arguments: [],
      sourcePath: 'external-repo',
    },
  ];

  const mockCategories = ['category1', 'category2', 'category3'];
  const mockSources = ['qnsc-mcp', 'external-repo'];

  beforeEach(() => {
    // Mock console.log
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    // Mock process.exit
    processExitSpy = spyOn(process, 'exit').mockImplementation((() => undefined) as any);

    // Reset process.argv
    process.argv = [...originalProcessArgv];

    // Reset all mocks
    mockLoadConfig.mockClear();
    mockDisplayHeader.mockClear();
    mockDisplayError.mockClear();
    mockBold.mockClear().mockImplementation((text) => `<bold>${text}</bold>`);
    mockDim.mockClear().mockImplementation((text) => `<dim>${text}</dim>`);
    mockInitialize.mockClear().mockImplementation(() => Promise.resolve());
    mockGetAllPrompts.mockClear().mockImplementation(() => mockPrompts);
    mockGetCategories.mockClear().mockImplementation(() => mockCategories);
    // mockGetPromptSources.mockClear().mockImplementation(() => mockSources);
    mockGetPromptsByCategory.mockClear().mockImplementation((category) => {
      return mockPrompts.filter((prompt) => prompt.category === category);
    });
    mockNotifyIfUpdateAvailable.mockClear().mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    // Restore all mocks
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
    process.argv = originalProcessArgv;
  });

  describe('Listing Prompts', () => {
    it.skip('should display all prompts with correct formatting', async () => {
      await listPrompts();

      // Verify registry methods were called
      expect(mockInitialize).toHaveBeenCalled();
      expect(mockGetAllPrompts).toHaveBeenCalled();
      // expect(mockGetPromptSources).toHaveBeenCalled();
      expect(mockGetCategories).toHaveBeenCalled();

      // Verify prompt count is displayed (now includes sources)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `📋 Available Prompts: ${mockPrompts.length} prompts(s) from ${mockSources.length} sources in ${mockCategories.length} categories`,
        ),
      );

      // Check that sources are displayed
      mockSources.forEach((source) => {
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(source));
      });

      // Verify that prompt details are displayed
      mockPrompts.forEach((prompt) => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(`• <bold>${prompt.name}</bold>`),
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(prompt.description));
      });

      // Check that bold formatting was applied correctly
      expect(mockBold).toHaveBeenCalledWith('Alpha Prompt');
      expect(mockBold).toHaveBeenCalledWith('Beta Prompt');
      expect(mockBold).toHaveBeenCalledWith('Gamma Prompt');
      expect(mockBold).toHaveBeenCalledWith('Delta Prompt');
      expect(mockBold).toHaveBeenCalledWith('Epsilon Prompt');
    });
  });

  describe('Error Handling', () => {
    it('should handle registry initialization errors', async () => {
      const error = new Error('Registry initialization failed');
      mockInitialize.mockImplementation(() => Promise.reject(error));

      await listPrompts();

      expect(mockDisplayError).toHaveBeenCalledWith('Error listing prompts', error);
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle other runtime errors', async () => {
      const error = new Error('Something went wrong');

      // Reset previous mocks and make sure initialize succeeds
      mockInitialize.mockImplementation(() => Promise.resolve());

      // Make getAllPrompts throw our specific error
      mockGetAllPrompts.mockImplementation(() => {
        throw error;
      });

      await listPrompts();

      expect(mockDisplayError).toHaveBeenCalledWith('Error listing prompts', expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Output Formatting', () => {
    it('should sort sources with qnsc-mcp first, then alphabetically', async () => {
      // Use a spy to track the order of source output
      const outputOrder: string[] = [];
      consoleLogSpy.mockImplementation((message: any) => {
        // Capture source names from the output (looking for the source header pattern)
        if (typeof message === 'string' && message.includes('\x1b[1m\x1b[35m📦')) {
          const match = message.match(/📦 (.*?) \(/);
          if (match && match[1]) {
            outputOrder.push(match[1]);
          }
        }
      });

      await listPrompts();

      // Check that qnsc-mcp comes first, then other sources alphabetically
      expect(outputOrder).toEqual(['qnsc-mcp', 'external-repo']);
    });

    it.skip('should sort prompts alphabetically within each category', async () => {
      // Create a category with prompts that are not alphabetically ordered
      const unorderedPrompts = [
        {
          id: 'prompt1',
          name: 'Zebra Prompt',
          description: 'Prompt Z',
          category: 'testCategory',
          arguments: [],
          sourcePath: 'qnsc-mcp',
        },
        {
          id: 'prompt2',
          name: 'Apple Prompt',
          description: 'Prompt A',
          category: 'testCategory',
          arguments: [],
          sourcePath: 'qnsc-mcp',
        },
        {
          id: 'prompt3',
          name: 'Monkey Prompt',
          description: 'Prompt M',
          category: 'testCategory',
          arguments: [],
          sourcePath: 'qnsc-mcp',
        },
      ];

      // Set up prompts for this test
      mockGetAllPrompts.mockImplementation(() => unorderedPrompts);

      // Mock getPromptSources to only return qnsc-mcp
      // mockGetPromptSources.mockImplementation(() => ['qnsc-mcp']);

      // Mock the getCategories for this specific test
      mockGetCategories.mockImplementation(() => ['testCategory']);

      // Mock the getPromptsByCategory for this specific category
      mockGetPromptsByCategory.mockImplementation((category: string) => {
        if (category === 'testCategory') {
          return unorderedPrompts;
        }
        return [];
      });

      // Collect prompt names in the order they're logged
      const promptNames: string[] = [];

      // Override the bold function to track the order of prompt names
      mockBold.mockImplementation((text: string) => {
        promptNames.push(text);
        return `<bold>${text}</bold>`;
      });

      await listPrompts();

      // Check that prompts are in alphabetical order
      expect(promptNames).toEqual(['Apple Prompt', 'Monkey Prompt', 'Zebra Prompt']);
    });
  });
});
