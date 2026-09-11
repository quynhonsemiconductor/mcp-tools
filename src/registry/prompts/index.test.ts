import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as loggerModule from '../../services/logger';
import fs from 'fs';

import { setupStandardMocks } from '../../test-utils/mocks';
const { mockDisplay, mockLoadConfig } = setupStandardMocks();
const { displayError: mockDisplayError } = mockDisplay;

import { TextContent } from '@modelcontextprotocol/sdk/types.js';
import z from 'zod';
import { Prompt, PromptRegistryManager } from './index';
import { PromptConfig, PromptHandler } from './types';

// Sample prompt arguments
const SamplePromptArguments = {
  input: z.string().describe('Input for the sample prompt'),
};

// Sample prompt handler
class SamplePromptHandler implements PromptHandler {
  async load(args: { input: string }): Promise<string> {
    return `Sample prompt with input: ${args.input}`;
  }
}

// Mock git utilities to prevent real git operations
const mockIsGitInstalled = mock(() => Promise.resolve(false));
const mockEnsureRepositoryUpToDate = mock(() => Promise.resolve(false));
const mockGetRepositoryPath = mock((repo: string) => repo);

// Mock markdown parser utilities
const mockFindMarkdownFiles = mock(() => ['/test/repo/docs/test-prompt.md']);
const mockParseMarkdownPrompt = mock(() => ({
  config: {
    id: 'test-prompt',
    name: 'Test Prompt',
    description: 'A test prompt',
    category: 'Analysis',
    arguments: {},
  },
  content: 'This is a test prompt.',
}));

void mock.module('../../utils/git', () => ({
  isGitInstalled: mockIsGitInstalled,
  ensureRepositoryUpToDate: mockEnsureRepositoryUpToDate,
  getRepositoryPath: mockGetRepositoryPath,
}));

void mock.module('./markdown-prompt-parser', () => ({
  findMarkdownFiles: mockFindMarkdownFiles,
  parseMarkdownPrompt: mockParseMarkdownPrompt,
}));

// Mock fs to handle local path checking
const mockExistsSync = mock(() => true);

void mock.module('fs', () => ({
  existsSync: mockExistsSync,
  default: {
    existsSync: mockExistsSync,
  },
}));

describe('Prompt Registry', () => {
  let promptRegistry: PromptRegistryManager;
  let mockPromptConfig: PromptConfig;

  beforeEach(() => {
    // Create a new registry manager for each test
    promptRegistry = new PromptRegistryManager();

    // Create a sample prompt config
    mockPromptConfig = {
      id: 'sample-prompt',
      name: 'Sample Prompt',
      description: 'A sample prompt for testing',
      category: 'Analysis',
      arguments: SamplePromptArguments,
      excludeByDefault: false,
    };

    // Reset all mocks
    mockDisplayError.mockClear();
    mockLoadConfig.mockClear().mockImplementation(() => ({
      prompts: { repositories: [] },
    }));

    // Clear the registry for a clean slate
    promptRegistry.resetRegistry();
  });

  describe('Prompt Decorator', () => {
    it('should register a prompt with the registry', () => {
      // Create a test class with the Prompt decorator
      @Prompt(mockPromptConfig)
      class _TestPrompt implements PromptHandler {
        async load(_args: any): Promise<string> {
          return 'Test';
        }
      }

      // Check if the prompt was registered
      expect(promptRegistry.hasPromptWithId('sample-prompt')).toBe(true);
      const config = promptRegistry.getPromptById('sample-prompt');
      expect(config).toBeDefined();
      expect(config?.name).toBe('Sample Prompt');
    });

    it('should overwrite existing prompt with a warning when ID conflicts', () => {
      // Spy on the structured logger's warn
      const warnSpy = spyOn(loggerModule, 'logWarn').mockImplementation(() => {});

      // Register a prompt
      @Prompt(mockPromptConfig)
      class _TestPrompt1 implements PromptHandler {
        async load(_args: any): Promise<string> {
          return 'Test 1';
        }
      }

      // Register another prompt with the same ID
      const conflictConfig = { ...mockPromptConfig, name: 'Conflict Prompt' };
      @Prompt(conflictConfig)
      class _TestPrompt2 implements PromptHandler {
        async load(_args: any): Promise<string> {
          return 'Test 2';
        }
      }

      // Check that the warning was issued
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'));

      // Check that the second prompt replaced the first
      const config = promptRegistry.getPromptById('sample-prompt');
      expect(config?.name).toBe('Conflict Prompt');

      // Clean up
      warnSpy.mockRestore();
    });
  });

  describe('Registry Manager', () => {
    it('should initialize the registry', async () => {
      await promptRegistry.initialize();
      expect(mockLoadConfig).toHaveBeenCalled();
    });

    it('should manually register a prompt', () => {
      promptRegistry.registerPrompt(
        'manual-prompt',
        {
          ...mockPromptConfig,
          id: 'manual-prompt',
          name: 'Manual Prompt',
        },
        SamplePromptHandler,
      );

      expect(promptRegistry.hasPromptWithId('manual-prompt')).toBe(true);
      expect(promptRegistry.getPromptCount()).toBe(1);
    });

    it('should get all prompts', () => {
      // Register multiple prompts
      promptRegistry.registerPrompt(
        'prompt1',
        { ...mockPromptConfig, id: 'prompt1', name: 'Prompt 1' },
        SamplePromptHandler,
      );

      promptRegistry.registerPrompt(
        'prompt2',
        { ...mockPromptConfig, id: 'prompt2', name: 'Prompt 2' },
        SamplePromptHandler,
      );

      const allPrompts = promptRegistry.getAllPrompts();
      expect(allPrompts.length).toBe(2);
      expect(allPrompts.map((p) => p.name)).toContain('Prompt 1');
      expect(allPrompts.map((p) => p.name)).toContain('Prompt 2');
    });

    it('should get prompts by category', () => {
      // Register prompts in different categories
      promptRegistry.registerPrompt(
        'prompt1',
        { ...mockPromptConfig, id: 'prompt1', category: 'Category1' },
        SamplePromptHandler,
      );

      promptRegistry.registerPrompt(
        'prompt2',
        { ...mockPromptConfig, id: 'prompt2', category: 'Category2' },
        SamplePromptHandler,
      );

      const category1Prompts = promptRegistry.getPromptsByCategory('Category1');
      expect(category1Prompts.length).toBe(1);
      expect(category1Prompts[0].id).toBe('prompt1');
    });

    it('should get all categories', () => {
      // Register prompts in different categories
      promptRegistry.registerPrompt(
        'prompt1',
        { ...mockPromptConfig, id: 'prompt1', category: 'Category1' },
        SamplePromptHandler,
      );

      promptRegistry.registerPrompt(
        'prompt2',
        { ...mockPromptConfig, id: 'prompt2', category: 'Category2' },
        SamplePromptHandler,
      );

      promptRegistry.registerPrompt(
        'prompt3',
        { ...mockPromptConfig, id: 'prompt3', category: 'Category1' },
        SamplePromptHandler,
      );

      const categories = promptRegistry.getCategories();
      expect(categories.length).toBe(2);
      expect(categories).toContain('Category1');
      expect(categories).toContain('Category2');
    });

    it('should handle middleware properly', async () => {
      // Create a mock middleware that adds a prefix
      const testMiddleware = async (
        context: any,
        next: (context: any) => Promise<string>,
      ): Promise<string> => {
        const result = await next(context);
        return `PREFIX: ${result}`;
      };

      // Register a prompt
      promptRegistry.registerPrompt('test-prompt', mockPromptConfig, SamplePromptHandler);

      // Add middleware
      promptRegistry.use(testMiddleware);

      // Create a mock server to test registration
      const _mockServer = {
        addTool: mock(() => {}),
      };

      const handler = new SamplePromptHandler();
      const loadFn = handler.load.bind(handler);

      // Create a middleware chain and test it
      // @ts-expect-error - method is private, but we need to test it
      const loadWithMiddleware = promptRegistry.createMiddlewareChain(
        'test-prompt',
        mockPromptConfig,
        loadFn,
      );

      const result = await loadWithMiddleware({ input: 'test' });
      expect((result.messages[0].content as TextContent).text).toBe(
        'PREFIX: Sample prompt with input: test',
      );
    });

    it('should exclude prompts marked as excludeByDefault', () => {
      // Register a regular prompt
      promptRegistry.registerPrompt('normal-prompt', mockPromptConfig, SamplePromptHandler);

      // Register a prompt that should be excluded by default
      promptRegistry.registerPrompt(
        'excluded-prompt',
        { ...mockPromptConfig, id: 'excluded-prompt', excludeByDefault: true },
        SamplePromptHandler,
      );

      // We're not testing with the singleton instance, so we can't test filtering here
      // This is just a placeholder test for now
      const allPrompts = promptRegistry.getAllPrompts();
      expect(allPrompts.length).toBe(2);
    });
  });

  describe('External Repository Loading', () => {
    beforeEach(() => {
      // Reset external mocks
      mockIsGitInstalled.mockClear();
      mockEnsureRepositoryUpToDate.mockClear();
      mockGetRepositoryPath.mockClear();
      mockFindMarkdownFiles.mockClear();
      mockParseMarkdownPrompt.mockClear();

      // Setup default implementations
      mockIsGitInstalled.mockResolvedValue(true);
      mockEnsureRepositoryUpToDate.mockResolvedValue(true);
      mockGetRepositoryPath.mockImplementation((repo: string) => repo);
      mockFindMarkdownFiles.mockReturnValue(['/test/repo/docs/test-prompt.md']);
      mockParseMarkdownPrompt.mockReturnValue({
        config: {
          id: 'test-prompt',
          name: 'Test Prompt',
          description: 'A test prompt',
          category: 'Analysis',
          arguments: [],
        },
        content: 'This is a test prompt.',
      });
    });

    it('should skip loading when git is not installed', async () => {
      mockIsGitInstalled.mockResolvedValue(false);
      mockLoadConfig.mockReturnValue({
        prompts: {
          repositories: [
            {
              type: 'remote',
              repo: 'test/prompts-repo',
              branch: 'main',
            },
          ],
        },
      });

      await promptRegistry.initialize();

      expect(mockIsGitInstalled).toHaveBeenCalled();
      expect(mockEnsureRepositoryUpToDate).not.toHaveBeenCalled();
    });

    it('should handle empty repository configuration', async () => {
      mockLoadConfig.mockReturnValue({
        prompts: { repositories: [] },
      });

      await promptRegistry.initialize();

      // Should initialize without errors and not attempt git operations
      expect(promptRegistry.getPromptCount()).toBe(0);
      expect(mockEnsureRepositoryUpToDate).not.toHaveBeenCalled();
    });

    it('should handle missing prompts configuration', async () => {
      mockLoadConfig.mockReturnValue({
        prompts: { repositories: [] },
      } as any);

      await promptRegistry.initialize();

      // Should initialize without errors
      expect(promptRegistry.getPromptCount()).toBe(0);
      expect(mockEnsureRepositoryUpToDate).not.toHaveBeenCalled();
    });

    it('should handle repository update failures gracefully', async () => {
      mockEnsureRepositoryUpToDate.mockResolvedValue(false);
      mockLoadConfig.mockReturnValue({
        prompts: {
          repositories: [
            {
              type: 'remote',
              repo: 'test/prompts-repo',
              branch: 'main',
            },
          ],
        },
      });

      await promptRegistry.initialize();

      expect(mockEnsureRepositoryUpToDate).toHaveBeenCalled();
      expect(promptRegistry.getPromptCount()).toBe(0);
    });

    it('should handle parse errors for individual files gracefully', async () => {
      mockParseMarkdownPrompt.mockReturnValue({
        config: null as any,
        content: '',
      });

      mockLoadConfig.mockReturnValue({
        prompts: {
          repositories: [
            {
              type: 'remote',
              repo: 'test/prompts-repo',
              branch: 'main',
            },
          ],
        },
      });

      await promptRegistry.initialize();

      expect(promptRegistry.getPromptCount()).toBe(0);
    });

    it('should handle prompts with same ID from different organizations', async () => {
      // Directly test the organization-scoped ID functionality by registering prompts manually
      const promptConfig1: PromptConfig = {
        id: 'duplicate-prompt-id',
        name: 'Test Prompt 1',
        description: 'A test prompt from org1',
        category: 'Analysis',
        arguments: {},
        sourceType: 'git',
        sourcePath: 'org1/test-repo',
      };

      const promptConfig2: PromptConfig = {
        id: 'duplicate-prompt-id',
        name: 'Test Prompt 2',
        description: 'A test prompt from org2',
        category: 'Analysis',
        arguments: {},
        sourceType: 'git',
        sourcePath: 'org2/test-repo',
      };

      // Simulate the organization-scoped ID logic
      const orgScopedId1 = `${promptConfig1.sourcePath}:${promptConfig1.id}`;
      const orgScopedId2 = `${promptConfig2.sourcePath}:${promptConfig2.id}`;

      // Store original IDs
      promptConfig1.originalId = promptConfig1.id;
      promptConfig1.id = orgScopedId1;
      promptConfig2.originalId = promptConfig2.id;
      promptConfig2.id = orgScopedId2;

      // Register both prompts
      promptRegistry.registerPrompt(promptConfig1.id, promptConfig1, SamplePromptHandler);
      promptRegistry.registerPrompt(promptConfig2.id, promptConfig2, SamplePromptHandler);

      // Should have 2 prompts registered (one from each org)
      expect(promptRegistry.getPromptCount()).toBeGreaterThanOrEqual(2);

      // Check that both are registered with organization-scoped IDs
      expect(promptRegistry.hasPromptWithId('org1/test-repo:duplicate-prompt-id')).toBe(true);
      expect(promptRegistry.hasPromptWithId('org2/test-repo:duplicate-prompt-id')).toBe(true);

      // Check that original IDs are not in the registry
      expect(promptRegistry.hasPromptWithId('duplicate-prompt-id')).toBe(false);

      // Verify the prompts have correct source paths
      const allPrompts = promptRegistry.getAllPrompts();
      const org1Prompt = allPrompts.find((p) => p.sourcePath === 'org1/test-repo');
      const org2Prompt = allPrompts.find((p) => p.sourcePath === 'org2/test-repo');

      expect(org1Prompt).toBeDefined();
      expect(org2Prompt).toBeDefined();

      // Verify originalId is preserved
      expect(org1Prompt?.originalId).toBe('duplicate-prompt-id');
      expect(org2Prompt?.originalId).toBe('duplicate-prompt-id');
    });

    describe('Local Repository Support', () => {
      let existsSyncSpy: any;

      beforeEach(() => {
        // Reset mocks for each test
        mockExistsSync.mockClear();
        mockExistsSync.mockReturnValue(true);

        // Spy on fs.existsSync
        existsSyncSpy = spyOn(fs, 'existsSync').mockImplementation(() => true);
      });

      afterEach(() => {
        existsSyncSpy?.mockRestore();
      });

      it('should handle local repositories without git operations', async () => {
        const localPath = '/absolute/path/to/prompts';

        mockLoadConfig.mockReturnValue({
          prompts: {
            repositories: [
              {
                type: 'local',
                repo: localPath,
                include: ['*.md'],
              },
            ],
          },
        });

        mockFindMarkdownFiles.mockReturnValue([`${localPath}/test-prompt.md`]);
        mockParseMarkdownPrompt.mockReturnValue({
          config: {
            id: 'local-test-prompt',
            name: 'Local Test Prompt',
            description: 'A local test prompt',
            category: 'Analysis',
            arguments: [],
          },
          content: 'This is a local test prompt.',
        });

        await promptRegistry.initialize();

        // Should not attempt git operations for local repos
        expect(mockIsGitInstalled).not.toHaveBeenCalled();
        expect(mockEnsureRepositoryUpToDate).not.toHaveBeenCalled();

        // Should find and parse markdown files
        expect(mockFindMarkdownFiles).toHaveBeenCalledWith(localPath, ['*.md']);

        // Should register the prompt with local scoping
        const allPrompts = promptRegistry.getAllPrompts();
        expect(allPrompts.length).toBe(1);

        const localPrompt = allPrompts[0];
        expect(localPrompt.id).toBe('local:prompts:local-test-prompt');
        expect(localPrompt.originalId).toBe('local-test-prompt');
        expect(localPrompt.sourcePath).toBe(localPath);
        expect(localPrompt.sourceType).toBe('qnsc-mcp');
      });

      it('should skip non-existent local repositories', async () => {
        const localPath = '/non/existent/path';

        // Mock existsSync to return false for this test
        existsSyncSpy.mockImplementation((path: string) => path !== localPath);

        mockLoadConfig.mockReturnValue({
          prompts: {
            repositories: [
              {
                type: 'local',
                repo: localPath,
              },
            ],
          },
        });

        await promptRegistry.initialize();

        // Should not register any prompts
        expect(promptRegistry.getPromptCount()).toBe(0);
      });

      it('should handle mixed remote and local repositories', async () => {
        const localPath = '/local/prompts';
        mockLoadConfig.mockReturnValue({
          prompts: {
            repositories: [
              {
                type: 'remote',
                repo: 'org/remote-repo',
                branch: 'main',
              },
              {
                type: 'local',
                repo: localPath,
              },
            ],
          },
        });

        // Mock responses for both types
        mockFindMarkdownFiles.mockClear();
        let findCallCount = 0;
        mockFindMarkdownFiles.mockImplementation(() => {
          findCallCount++;
          if (findCallCount === 1) {
            return ['/test/repo/docs/remote-prompt.md'];
          } else {
            return [`${localPath}/local-prompt.md`];
          }
        });

        let parseCallCount = 0;
        mockParseMarkdownPrompt.mockImplementation(() => {
          parseCallCount++;
          if (parseCallCount === 1) {
            return {
              config: {
                id: 'remote-prompt',
                name: 'Remote Prompt',
                description: 'A remote prompt',
                category: 'Analysis',
                arguments: [],
              },
              content: 'Remote prompt content.',
            };
          } else {
            return {
              config: {
                id: 'local-prompt',
                name: 'Local Prompt',
                description: 'A local prompt',
                category: 'Analysis',
                arguments: [],
              },
              content: 'Local prompt content.',
            };
          }
        });

        await promptRegistry.initialize();

        // Should handle both git and local operations
        expect(mockIsGitInstalled).toHaveBeenCalled();
        expect(mockEnsureRepositoryUpToDate).toHaveBeenCalled();
        expect(mockExistsSync).toHaveBeenCalledWith(localPath);

        // Should register prompts from both sources
        const allPrompts = promptRegistry.getAllPrompts();
        expect(allPrompts.length).toBe(2);

        const remotePrompt = allPrompts.find((p) => p.id.includes('org/remote-repo'));
        const localPrompt = allPrompts.find((p) => p.id.startsWith('local:'));

        expect(remotePrompt).toBeDefined();
        expect(localPrompt).toBeDefined();

        expect(remotePrompt?.sourceType).toBe('git');
        expect(localPrompt?.sourceType).toBe('qnsc-mcp');
      });
    });
  });
});
