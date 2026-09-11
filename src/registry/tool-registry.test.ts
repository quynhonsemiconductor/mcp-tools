import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { z } from 'zod';
import { BUNDLED_TOOL_DELIMITER } from '../gateway/bundled-mcp-manager';

import { createDefaultMockConfig, setupStandardMocks } from '../test-utils/mocks';
const { mockLoadConfig } = setupStandardMocks();

import { Tool, ToolRegistryManager } from './tool-registry';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCategories, ToolHandler } from './types';

const _MOCK_TOOL_LOADER = '../test-utils/mock-tool-loader';

// Setup console mocks
let consoleLogSpy: ReturnType<typeof spyOn>;
let consoleDebugSpy: ReturnType<typeof spyOn>;
let consoleWarnSpy: ReturnType<typeof spyOn>;
let consoleErrorSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
  consoleDebugSpy = spyOn(console, 'debug').mockImplementation(() => {});
  consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
  consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Restore console mocks
  consoleLogSpy.mockRestore();
  consoleDebugSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();

  // Reset call history, then restore the *canonical* ambient config (the exact
  // shape setupStandardMocks builds) rather than a hand-written subset. Bun's
  // mock.module state is process-global, so whatever this file leaves is what
  // any later file relying on the ambient mock sees — a partial shape would
  // just move the `undefined`-field crash (doctor-tool hit it on `.tools`) to
  // another field like `config.logging.level`.
  mockLoadConfig.mockReset();
  mockLoadConfig.mockImplementation(() => createDefaultMockConfig());
});

// Helper to create a test tool class
const createTestTool = (
  id: string,
  name: string,
  category: string,
  includeByDefault: boolean = false,
) => {
  @Tool({
    id,
    name,
    description: `Test tool ${name}`,
    category: category as ToolCategories,
    parameters: z.object({ input: z.string() }),
    includeByDefault: includeByDefault || false,
  })
  class TestTool implements ToolHandler {
    async execute(args: any): Promise<any> {
      return args.input;
    }
  }

  return TestTool;
};

describe('Tool Registry', () => {
  let registry: ToolRegistryManager;

  beforeEach(() => {
    // Create a fresh registry for each test
    registry = new ToolRegistryManager();

    // Reset any tools that might have been registered
    registry.resetRegistry();

    // Reset the config mock
    mockLoadConfig.mockReset();
    mockLoadConfig.mockImplementation(() => ({}));
  });

  describe('Tool Decorator', () => {
    it('should register a tool when the decorator is applied', () => {
      // Create a test tool
      const TestTool = createTestTool('test1', 'Test Tool 1', 'testing');

      // Create a new instance (just to verify it doesn't throw)
      new TestTool();

      // Verify the tool was registered
      expect(registry.hasToolWithId('test1')).toBe(true);
      expect(registry.getToolById('test1')?.name).toBe('Test Tool 1');
    });

    it('should override a tool if registered with the same ID', () => {
      // Register first tool
      createTestTool('duplicate', 'First Tool', 'testing');

      // Register second tool with same ID
      createTestTool('duplicate', 'Second Tool', 'testing');

      // Verify the second registration won
      expect(registry.getToolById('duplicate')?.name).toBe('Second Tool');
    });
  });

  describe('Registry Initialization', () => {
    it('should load configuration and set initialized flag', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      const mockConfig = { tools: { include: ['test1'] } };
      mockLoadConfig.mockImplementation(() => mockConfig);

      // Create a test tool before initialization
      createTestTool('test1', 'Test Tool 1', 'testing');

      await registry.initialize();

      const allTools = registry.getAllTools(true);

      expect(mockLoadConfig).toHaveBeenCalled();
      expect(registry.hasToolWithId('test1')).toBe(true);
      expect(allTools.length).toBeGreaterThan(0);
      expect(allTools.some((tool) => tool.id === 'test1')).toBe(true);
    });

    it('should always load all tool categories', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      const mockConfig = {
        tools: { includeCategories: ['category1'], excludeCategories: ['category2'] },
      };
      mockLoadConfig.mockImplementation(() => mockConfig);

      createTestTool('test1', 'Test Tool 1', 'category1');

      // Spy on the mock loader via the same path that initialize() uses for dynamic import
      const mockLoader = await import('./tool-loader');
      const loadSpy = spyOn(mockLoader, 'loadToolsByCategories');

      await registry.initialize();

      // Should always load all categories with no arguments
      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(loadSpy.mock.calls[0]).toEqual([]);

      loadSpy.mockRestore();
    });

    it('should return tools from all categories in unfiltered mode even when config excludes categories', async () => {
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Config only includes category1 and excludes category2
      const mockConfig = {
        tools: { includeCategories: ['category1'], excludeCategories: ['category2'] },
      };
      mockLoadConfig.mockImplementation(() => mockConfig);

      // Register tools across multiple categories
      createTestTool('tool-cat1', 'Tool Cat1', 'category1');
      createTestTool('tool-cat2', 'Tool Cat2', 'category2');
      createTestTool('tool-cat3', 'Tool Cat3', 'category3');

      await registry.initialize();

      // Unfiltered: all tools from all categories should be present
      const allTools = registry.getAllTools(false);
      expect(allTools.some((t) => t.id === 'tool-cat1')).toBe(true);
      expect(allTools.some((t) => t.id === 'tool-cat2')).toBe(true);
      expect(allTools.some((t) => t.id === 'tool-cat3')).toBe(true);

      // All categories should be accessible unfiltered
      const allCategories = registry.getCategories(false);
      expect(allCategories).toContain('category1');
      expect(allCategories).toContain('category2');
      expect(allCategories).toContain('category3');
    });

    it('should re-throw initialization errors and keep initialized as false', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Make loadConfig throw an error
      mockLoadConfig.mockImplementation(() => {
        throw new Error('Config error');
      });

      // The error should be re-thrown
      try {
        await registry.initialize();
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toBe('Config error');
      }

      // Calling initialize again should attempt initialization again (not skip due to initialized flag)
      try {
        await registry.initialize();
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.message).toBe('Config error');
      }
    });
  });

  describe('Tool Filtering', () => {
    beforeEach(() => {
      // Create a fresh registry and clear any existing tools for each filtering test
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create exactly 4 test tools with known IDs and categories
      createTestTool('test1', 'Test Tool 1', 'category1');
      createTestTool('test2', 'Test Tool 2', 'category1');
      createTestTool('test3', 'Test Tool 3', 'category2');
      createTestTool('test4', 'Test Tool 4', 'category2');

      // Create a bundled MCP test tool with our new delimiter format
      createTestTool(`test-mcp${BUNDLED_TOOL_DELIMITER}test-tool`, 'Bundled Test Tool', 'Bundled');
    });

    it('should include only tools with includeByDefault=true when no filters are specified', async () => {
      // Mock empty config
      mockLoadConfig.mockImplementation(() => ({}));

      // Clear existing tools and create tools with includeByDefault settings
      registry.resetRegistry();
      createTestTool('test1', 'Test Tool 1', 'category1', true); // This one should be included
      createTestTool('test2', 'Test Tool 2', 'category1'); // These three should be excluded
      createTestTool('test3', 'Test Tool 3', 'category2');
      createTestTool('test4', 'Test Tool 4', 'category2');

      // Initialize the registry with the mock config
      await registry.initialize();

      const allTools = registry.getAllTools(true);

      // There should be at least one tool with includeByDefault=true
      const includedByDefaultTools = allTools.filter((tool) => tool.includeByDefault === true);
      expect(includedByDefaultTools.length).toBeGreaterThan(0);
      expect(includedByDefaultTools.some((tool) => tool.id === 'test1')).toBe(true);
    });

    it('should filter tools by included IDs', async () => {
      // Mock config with included tools
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['test1', 'test3'] },
      }));

      // Clear existing tools
      registry.resetRegistry();
      createTestTool('test1', 'Test Tool 1', 'category1');
      createTestTool('test2', 'Test Tool 2', 'category1');
      createTestTool('test3', 'Test Tool 3', 'category2');
      createTestTool('test4', 'Test Tool 4', 'category2', true); // This one has includeByDefault=true

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      // Should include test1, test3 (from the include list) AND test4 (because includeByDefault=true)
      // With the new logic, explicitly included tools are included, and tools with includeByDefault=true are also included
      expect(filteredTools.length).toBe(3);
      expect(filteredTools.map((t) => t.id).sort()).toEqual(['test1', 'test3', 'test4']);
    });

    it('should filter tools by excluded IDs', async () => {
      // Mock config with excluded tools
      mockLoadConfig.mockImplementation(() => ({
        tools: { exclude: ['test1', 'test3'] },
      }));

      // Clear existing tools
      registry.resetRegistry();
      createTestTool('test1', 'Test Tool 1', 'category1', true);
      createTestTool('test2', 'Test Tool 2', 'category1', true);
      createTestTool('test3', 'Test Tool 3', 'category2', true);
      createTestTool('test4', 'Test Tool 4', 'category2', true);

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      // All tools have includeByDefault=true, but test1 and test3 are explicitly excluded
      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual(['test2', 'test4']);
    });

    it('should filter tools by included categories', async () => {
      // Mock config with included categories
      mockLoadConfig.mockImplementation(() => ({
        tools: { includeCategories: ['category1'] },
      }));

      // Clear existing tools
      registry.resetRegistry();
      createTestTool('test1', 'Test Tool 1', 'category1');
      createTestTool('test2', 'Test Tool 2', 'category1');
      createTestTool('test3', 'Test Tool 3', 'category2');
      createTestTool('test4', 'Test Tool 4', 'category2', true);

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      // Should include test1, test2 (from category1) AND test4 (because includeByDefault=true)
      // With the new logic, tools from explicitly included categories are included, plus tools with includeByDefault=true
      expect(filteredTools.length).toBe(3);
      expect(filteredTools.map((t) => t.id).sort()).toEqual(['test1', 'test2', 'test4']);
    });

    it('should filter tools by excluded categories', async () => {
      // Mock config with excluded categories
      mockLoadConfig.mockImplementation(() => ({
        tools: { excludeCategories: ['category1'] },
      }));

      // Clear existing tools
      registry.resetRegistry();
      createTestTool('test1', 'Test Tool 1', 'category1', true);
      createTestTool('test2', 'Test Tool 2', 'category1', true);
      createTestTool('test3', 'Test Tool 3', 'category2', true);
      createTestTool('test4', 'Test Tool 4', 'category2', true);

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      // All tools have includeByDefault=true, but category1 tools are excluded
      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual(['test3', 'test4']);
    });

    it('should include tools when includeCategories uses parent category prefix', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { includeCategories: ['Github'] },
      }));

      registry.resetRegistry();
      createTestTool('gh-actions-1', 'GH Actions', 'Github: Actions');
      createTestTool('gh-pulls-1', 'GH Pulls', 'Github: Pulls');
      createTestTool('gh-repos-1', 'GH Repos', 'Github: Repos');
      createTestTool('k6-1', 'k6 Tool', 'k6');

      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      // All Github sub-categories should match, k6 should not
      expect(filteredTools.length).toBe(3);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'gh-actions-1',
        'gh-pulls-1',
        'gh-repos-1',
      ]);
    });

    it('should exclude tools when excludeCategories uses parent category prefix', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { excludeCategories: ['Github'] },
      }));

      registry.resetRegistry();
      createTestTool('gh-actions-1', 'GH Actions', 'Github: Actions', true);
      createTestTool('gh-pulls-1', 'GH Pulls', 'Github: Pulls', true);
      createTestTool('k6-1', 'k6 Tool', 'k6', true);

      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      // Github sub-categories should be excluded, k6 should remain
      expect(filteredTools.length).toBe(1);
      expect(filteredTools[0].id).toBe('k6-1');
    });
  });

  describe('Tool Registration with Server', () => {
    it('should register filtered tools with the MCP server', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create three test tools - one included by config, one excluded
      createTestTool('test1', 'Test Tool 1', 'category1'); // Included by config
      createTestTool('test3', 'Test Tool 3', 'category3'); // Not included

      // Configure to only include one tool explicitly
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['test1'] },
      }));

      // Initialize the registry with the mock config
      await registry.initialize();

      // Create a mock MCP server
      const mockregisterTool = mock(() => {});
      const mockServer = {
        registerTool: mockregisterTool,
      } as unknown as McpServer;

      // Register tools with the server
      registry.registerAllTools(mockServer);

      // Only the explicitly included tool should be registered
      expect(mockregisterTool).toHaveBeenCalledTimes(1);

      // Get the tool names that were registered
      const registeredTools = mockregisterTool.mock.calls.map((call: any) => call[0]);
      expect(registeredTools[0]).toBe('Test Tool 1'); // Included by config
    });

    it('should handle errors when registering tools', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create a single test tool that will be included by default
      createTestTool('test1', 'Test Tool 1', 'category1', true);

      // Initialize with empty config (will use includeByDefault settings)
      mockLoadConfig.mockImplementation(() => ({}));
      await registry.initialize();

      // Make the server throw an error when registering
      const mockregisterTool = mock(() => {
        throw new Error('Registration error');
      });

      const mockServer = {
        registerTool: mockregisterTool,
      } as unknown as McpServer;

      // This should not throw
      registry.registerAllTools(mockServer);

      // The method should have been called since the tool has includeByDefault=true
      expect(mockregisterTool).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tool Discovery and Management', () => {
    beforeEach(() => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create exactly three test tools
      createTestTool('test1', 'Test Tool 1', 'category1');
      createTestTool('test2', 'Test Tool 2', 'category1');
      createTestTool('test3', 'Test Tool 3', 'category2');
    });

    it('should get tools by category', () => {
      const category1Tools = registry.getToolsByCategory('category1');

      expect(category1Tools.length).toBe(2);
      expect(category1Tools.map((t) => t.id).sort()).toEqual(['test1', 'test2']);
    });

    it('should get all categories', () => {
      const categories = registry.getCategories();

      expect(categories).toContain('category1');
      expect(categories).toContain('category2');
      expect(categories.length).toBe(2);
    });

    it('should get filtered categories', async () => {
      // Configure to exclude category2
      mockLoadConfig.mockImplementation(() => ({
        tools: { excludeCategories: ['category2'] },
      }));

      // Clear and create tools with includeByDefault settings
      registry.resetRegistry();
      createTestTool('test1', 'Test Tool 1', 'category1', true); // Included by default
      createTestTool('test2', 'Test Tool 2', 'category1'); // Not included by default
      createTestTool('test3', 'Test Tool 3', 'category2', true); // In excluded category
      createTestTool('test4', 'Test Tool 4', 'category2'); // In excluded category

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredCategories = registry.getCategories(true);

      expect(filteredCategories).toContain('category1');
      expect(filteredCategories).not.toContain('category2');
      expect(filteredCategories.length).toBe(1);
    });

    it('should correctly report tool count', () => {
      expect(registry.getToolCount()).toBe(3);
    });

    it('should get a specific tool by ID', () => {
      const tool = registry.getToolById('test2');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('Test Tool 2');
    });

    it('should return undefined when getting a non-existent tool', () => {
      const tool = registry.getToolById('non-existent');

      expect(tool).toBeUndefined();
    });

    it('should check if a tool exists by ID', () => {
      expect(registry.hasToolWithId('test1')).toBe(true);
      expect(registry.hasToolWithId('non-existent')).toBe(false);
    });
  });

  describe('Manual Tool Registration', () => {
    it('should allow manual registration of tools', () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      class ManualTool implements ToolHandler {
        async execute(args: any): Promise<any> {
          return args.input;
        }
      }

      const toolConfig = {
        id: 'manual',
        name: 'Manual Tool',
        description: 'Manually registered tool',
        category: 'Utility' as const, // Use a valid ToolCategories value
        parameters: z.object({ input: z.string() }),
        includeByDefault: false,
      };

      registry.registerTool('manual', toolConfig, ManualTool);

      expect(registry.hasToolWithId('manual')).toBe(true);
      expect(registry.getToolById('manual')).toEqual(toolConfig);
    });
  });

  describe('Tool Filtering Include By Default', () => {
    beforeEach(() => {
      // Create a fresh registry and clear any existing tools for each filtering test
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create exactly 6 test tools with known IDs and categories
      createTestTool('test1', 'Test Tool 1', 'category1');
      createTestTool('test2', 'Test Tool 2', 'category1');
      createTestTool('test3', 'Test Tool 3', 'category2');
      createTestTool('test4', 'Test Tool 4', 'category2');
      createTestTool('test5', 'Test Tool 5', 'category3', true); // Include by default
      createTestTool('test6', 'Test Tool 6', 'category3');

      // Create bundled MCP tools
      createTestTool(`test-mcp${BUNDLED_TOOL_DELIMITER}bundled-tool`, 'Bundled Tool', 'Bundled');
      createTestTool(`test-mcp${BUNDLED_TOOL_DELIMITER}another-tool`, 'Another Tool', 'Bundled');
    });

    it('should include tools that have includeByDefault=true when no filters are specified', async () => {
      // Mock empty config
      mockLoadConfig.mockImplementation(() => ({}));

      // Initialize the registry with the mock config
      await registry.initialize();

      const allTools = registry.getAllTools(true);

      const includedByDefaultTools = allTools.filter((tool) => tool.includeByDefault);

      expect(includedByDefaultTools.length).toBe(1);
      expect(includedByDefaultTools[0].id).toBe('test5');
    });

    it('should include non-default tools when tool is explicitly included', async () => {
      // Mock config with included tools
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['test1', 'test5'] },
      }));

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual(['test1', 'test5']);
    });

    it('should include all tools from a category when category is included', async () => {
      // Mock config with included categories
      mockLoadConfig.mockImplementation(() => ({
        tools: { includeCategories: ['category3'] },
      }));

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual(['test5', 'test6']);
    });

    it.skip('should include bundled MCP tools when their MCP is included', async () => {
      // Mock config with included MCPs
      mockLoadConfig.mockImplementation(() => ({
        tools: { includeMCPs: ['test-mcp'] },
      }));

      // Initialize the registry with the mock config
      await registry.initialize();

      const filteredTools = registry.getAllTools(true);

      // Both tools from test-mcp should be included
      expect(
        filteredTools.filter((t) => t.id.startsWith(`test-mcp${BUNDLED_TOOL_DELIMITER}`)).length,
      ).toBe(2);
    });
  });

  describe('Glob Pattern Matching', () => {
    beforeEach(() => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create test tools with various naming patterns
      createTestTool('jira-create-issue', 'JIRA Create Issue', 'jira');
      createTestTool('jira-update-issue', 'JIRA Update Issue', 'jira');
      createTestTool('jira-delete-issue', 'JIRA Delete Issue', 'jira');
      createTestTool('confluence-create-page', 'Confluence Create Page', 'confluence');
      createTestTool('confluence-update-page', 'Confluence Update Page', 'confluence');
      createTestTool('github-create-pr', 'GitHub Create PR', 'github');
      createTestTool('github-merge-pr', 'GitHub Merge PR', 'github');
      createTestTool('slack-send-message', 'Slack Send Message', 'slack');
      createTestTool('my-custom-tool', 'My Custom Tool', 'custom');
    });

    it('should include tools matching wildcard prefix pattern', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['jira-*'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(3);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'jira-create-issue',
        'jira-delete-issue',
        'jira-update-issue',
      ]);
    });

    it('should include tools matching wildcard suffix pattern', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['*-issue'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(3);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'jira-create-issue',
        'jira-delete-issue',
        'jira-update-issue',
      ]);
    });

    it('should include tools matching wildcard in middle pattern', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['*-create-*'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(3);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'confluence-create-page',
        'github-create-pr',
        'jira-create-issue',
      ]);
    });

    it('should include tools matching multiple patterns', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['jira-*', 'github-*'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(5);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'github-create-pr',
        'github-merge-pr',
        'jira-create-issue',
        'jira-delete-issue',
        'jira-update-issue',
      ]);
    });

    it('should exclude tools matching wildcard pattern', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { exclude: ['jira-*'] },
      }));

      // Create tools with includeByDefault=true
      registry.resetRegistry();
      createTestTool('jira-create-issue', 'JIRA Create Issue', 'jira', true);
      createTestTool('jira-update-issue', 'JIRA Update Issue', 'jira', true);
      createTestTool('confluence-create-page', 'Confluence Create Page', 'confluence', true);
      createTestTool('github-create-pr', 'GitHub Create PR', 'github', true);

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      // Should include confluence and github, but exclude jira tools
      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'confluence-create-page',
        'github-create-pr',
      ]);
    });

    it('should handle complex glob patterns with double asterisk', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['**/*-pr'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'github-create-pr',
        'github-merge-pr',
      ]);
    });

    it('should combine exact match with glob patterns', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['my-custom-tool', 'slack-*'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'my-custom-tool',
        'slack-send-message',
      ]);
    });

    it('should respect exclude patterns when include patterns are present', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: {
          include: ['jira-*'],
          exclude: ['*-delete-*'],
        },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      // Should include jira tools except the delete one
      expect(filteredTools.length).toBe(2);
      expect(filteredTools.map((t) => t.id).sort()).toEqual([
        'jira-create-issue',
        'jira-update-issue',
      ]);
    });

    it('should handle patterns with no matches gracefully', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['nonexistent-*'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(0);
    });

    it('should match exact tool IDs even when patterns are used', async () => {
      mockLoadConfig.mockImplementation(() => ({
        tools: { include: ['jira-create-issue'] },
      }));

      await registry.initialize();
      const filteredTools = registry.getAllTools(true);

      expect(filteredTools.length).toBe(1);
      expect(filteredTools[0].id).toBe('jira-create-issue');
    });
  });

  describe('Tool Registration with isEnabled', () => {
    it('should register a tool when isEnabled returns true', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create a tool handler with isEnabled that returns true
      @Tool({
        id: 'enabled-tool',
        name: 'Enabled Tool',
        description: 'Tool that is enabled',
        category: 'testing' as ToolCategories,
        parameters: z.object({ input: z.string() }),
        includeByDefault: true,
      })
      class _EnabledTool implements ToolHandler {
        async execute(args: any): Promise<any> {
          return args.input;
        }

        isEnabled(_config: any): boolean {
          return true; // Always enabled
        }
      }

      // Initialize with empty config
      mockLoadConfig.mockImplementation(() => ({}));
      await registry.initialize();

      // Create a mock MCP server
      const mockregisterTool = mock(() => {});
      const mockServer = {
        registerTool: mockregisterTool,
      } as unknown as McpServer;

      // Register tools with the server
      registry.registerAllTools(mockServer);

      // The tool should be registered since isEnabled returned true
      expect(mockregisterTool).toHaveBeenCalledTimes(1);
      const calls = mockregisterTool.mock.calls as Array<Array<any>>;
      expect(calls[0][0]).toBe('Enabled Tool');
    });

    it('should skip registration when isEnabled returns false', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create a tool handler with isEnabled that returns false
      @Tool({
        id: 'disabled-tool',
        name: 'Disabled Tool',
        description: 'Tool that is disabled',
        category: 'testing' as ToolCategories,
        parameters: z.object({ input: z.string() }),
        includeByDefault: true,
      })
      class _DisabledTool implements ToolHandler {
        async execute(args: any): Promise<any> {
          return args.input;
        }

        isEnabled(_config: any): boolean {
          return false; // Always disabled
        }
      }

      // Initialize with empty config
      mockLoadConfig.mockImplementation(() => ({}));
      await registry.initialize();

      // Create a mock MCP server
      const mockregisterTool = mock(() => {});
      const mockServer = {
        registerTool: mockregisterTool,
      } as unknown as McpServer;

      // Register tools with the server
      registry.registerAllTools(mockServer);

      // The tool should NOT be registered since isEnabled returned false
      expect(mockregisterTool).toHaveBeenCalledTimes(0);
    });

    it('should register a tool without isEnabled method (undefined check)', async () => {
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();

      // Create a tool handler without isEnabled method
      @Tool({
        id: 'no-enabled-check-tool',
        name: 'No Enabled Check Tool',
        description: 'Tool without isEnabled method',
        category: 'testing' as ToolCategories,
        parameters: z.object({ input: z.string() }),
        includeByDefault: true,
      })
      class _NoEnabledCheckTool implements ToolHandler {
        async execute(args: any): Promise<any> {
          return args.input;
        }
        // No isEnabled method defined
      }

      // Initialize with empty config
      mockLoadConfig.mockImplementation(() => ({}));
      await registry.initialize();

      // Create a mock MCP server
      const mockregisterTool = mock(() => {});
      const mockServer = {
        registerTool: mockregisterTool,
      } as unknown as McpServer;

      // Register tools with the server
      registry.registerAllTools(mockServer);

      // The tool should be registered since there's no isEnabled method to prevent it
      expect(mockregisterTool).toHaveBeenCalledTimes(1);
      const calls = mockregisterTool.mock.calls as Array<Array<any>>;
      expect(calls[0][0]).toBe('No Enabled Check Tool');
    });
  });

  describe('translateStringArrayToContent', () => {
    it('should translate an array of strings to MCP content format', () => {
      const input = ['First message', 'Second message', 'Third message'];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeDefined();
      expect(result?.content).toHaveLength(3);
      expect(result?.content[0]).toEqual({
        type: 'text',
        text: 'First message',
      });
      expect(result?.content[1]).toEqual({
        type: 'text',
        text: 'Second message',
      });
      expect(result?.content[2]).toEqual({
        type: 'text',
        text: 'Third message',
      });
    });

    it('should handle an empty array of strings', () => {
      const input: string[] = [];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeDefined();
      expect(result?.content).toHaveLength(0);
      expect(result?.content).toEqual([]);
    });

    it('should handle a single string in an array', () => {
      const input = ['Single message'];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeDefined();
      expect(result?.content).toHaveLength(1);
      expect(result?.content[0]).toEqual({
        type: 'text',
        text: 'Single message',
      });
    });

    it('should return undefined for non-array input', () => {
      const input = 'Not an array';
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should return undefined for array with non-string elements', () => {
      const input = ['String', 123, 'Another string'];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should return undefined for array of numbers', () => {
      const input = [1, 2, 3];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should return undefined for array of objects', () => {
      const input = [{ key: 'value' }, { key: 'value2' }];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should return undefined for null input', () => {
      const input = null;
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const input = undefined;
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should handle strings with special characters', () => {
      const input = [
        'String with "quotes"',
        "String with 'single quotes'",
        'String with\nnewlines',
        'String with\ttabs',
        'String with émojis 🎉',
      ];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeDefined();
      expect(result?.content).toHaveLength(5);
      expect(result?.content[0].text).toBe('String with "quotes"');
      expect(result?.content[1].text).toBe("String with 'single quotes'");
      expect(result?.content[2].text).toBe('String with\nnewlines');
      expect(result?.content[3].text).toBe('String with\ttabs');
      expect(result?.content[4].text).toBe('String with émojis 🎉');
    });

    it('should handle empty strings in array', () => {
      const input = ['', 'Non-empty', ''];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeDefined();
      expect(result?.content).toHaveLength(3);
      expect(result?.content[0]).toEqual({ type: 'text', text: '' });
      expect(result?.content[1]).toEqual({ type: 'text', text: 'Non-empty' });
      expect(result?.content[2]).toEqual({ type: 'text', text: '' });
    });

    it('should return undefined for mixed array with null values', () => {
      const input = ['String', null, 'Another string'];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should return undefined for array with boolean values', () => {
      const input = ['String', true, false];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeUndefined();
    });

    it('should handle very long strings', () => {
      const longString = 'A'.repeat(10000);
      const input = [longString, 'Short string'];
      // Create a fresh registry and clear any existing tools
      registry = new ToolRegistryManager();
      registry.resetRegistry();
      const result = registry.translateStringArrayToContent(input);

      expect(result).toBeDefined();
      expect(result?.content).toHaveLength(2);
      expect(result?.content[0].text).toBe(longString);
      expect(result?.content[0].text.length).toBe(10000);
      expect(result?.content[1].text).toBe('Short string');
    });
  });

  describe('addExcludedCategories', () => {
    it('adds categories when config.tools is undefined', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      delete (config as any).tools;

      registry.addExcludedCategories(['k6', 'k6: Board']);

      expect(config.tools?.excludeCategories).toEqual(['k6', 'k6: Board']);
    });

    it('adds categories when excludeCategories is undefined', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { include: [] };

      registry.addExcludedCategories(['k6']);

      expect(config.tools.excludeCategories).toEqual(['k6']);
    });

    it('appends to existing excludeCategories', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { excludeCategories: ['NPM'] };

      registry.addExcludedCategories(['k6']);

      expect(config.tools.excludeCategories).toEqual(['NPM', 'k6']);
    });

    it('deduplicates categories', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { excludeCategories: ['k6'] };

      registry.addExcludedCategories(['k6', 'k6: Board']);

      expect(config.tools.excludeCategories).toEqual(['k6', 'k6: Board']);
    });

    it('handles empty input array', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { excludeCategories: ['NPM'] };

      registry.addExcludedCategories([]);

      expect(config.tools.excludeCategories).toEqual(['NPM']);
    });
  });

  describe('addExcludedTools', () => {
    it('adds tool IDs when config.tools is undefined', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      delete (config as any).tools;

      registry.addExcludedTools(['sled']);

      expect(config.tools?.exclude).toEqual(['sled']);
    });

    it('adds tool IDs when exclude is undefined', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { includeCategories: [] };

      registry.addExcludedTools(['sled']);

      expect(config.tools.exclude).toEqual(['sled']);
    });

    it('appends to existing exclude and deduplicates', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { exclude: ['sled'] };

      registry.addExcludedTools(['sled', 'prr']);

      expect(config.tools.exclude).toEqual(['sled', 'prr']);
    });

    it('suppresses the local sled tool by ID while remote-sled tools survive', async () => {
      // Pins the headline remote-first/fallback behavior: excluding the exact
      // local tool ID must not sweep the remote replacement tools too. Guards
      // against a future glob (e.g. `sled*`) leaving a client with no sled at all.
      mockLoadConfig.mockImplementation(() => ({ tools: {} }));
      registry.resetRegistry();
      createTestTool('sled', 'SLED', 'QNSC Internal', true);
      createTestTool('remote-sled__lookup', 'Remote SLED Lookup', 'Remote', true);
      await registry.initialize();

      // Mirrors applyRemotePolicy's tool-ID suppression side effect.
      registry.addExcludedTools(['sled']);

      const filteredIds = registry.getAllTools(true).map((t) => t.id);
      expect(filteredIds).not.toContain('sled');
      expect(filteredIds).toContain('remote-sled__lookup');
    });
  });

  describe('addIncludedCategories', () => {
    it('adds categories to existing includeCategories', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { includeCategories: ['k6'] };

      registry.addIncludedCategories(['Remote']);

      expect(config.tools.includeCategories).toEqual(['k6', 'Remote']);
    });

    it('does not add duplicates', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { includeCategories: ['k6', 'Remote'] };

      registry.addIncludedCategories(['Remote']);

      expect(config.tools.includeCategories).toEqual(['k6', 'Remote']);
    });

    it('does nothing when includeCategories is not set', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = {};

      registry.addIncludedCategories(['Remote']);

      expect(config.tools.includeCategories).toBeUndefined();
    });

    it('does nothing when tools config is undefined', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      delete (config as any).tools;

      registry.addIncludedCategories(['Remote']);

      expect(config.tools).toBeUndefined();
    });

    it('handles multiple categories', () => {
      registry = new ToolRegistryManager();
      const config = registry.getConfig();
      config.tools = { includeCategories: ['k6'] };

      registry.addIncludedCategories(['Remote', 'PagerDuty']);

      expect(config.tools.includeCategories).toEqual(['k6', 'Remote', 'PagerDuty']);
    });
  });
});
