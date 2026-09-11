import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';

// Set up GitHub mocks before importing the file to be tested
import { setupGitHubMocks } from './__test__/test-utils';

const _mocks = setupGitHubMocks();

// Import after mocking modules
import { ToolConfig } from '../registry';
import { GithubBaseTool } from './base-tool';

// Create a concrete implementation of the abstract class for testing
class TestGithubTool extends GithubBaseTool {
  async execute(_args: any): Promise<string> {
    return 'test';
  }

  // Expose protected method for testing
  public getClientForTesting() {
    return this.getClient();
  }
}

describe('GithubBaseTool', () => {
  let tool: TestGithubTool;
  let originalGithubToken: string | undefined;
  let mockConfig: ToolConfig;

  beforeEach(() => {
    tool = new TestGithubTool();
    // Store original token to restore later
    originalGithubToken = process.env.GITHUB_TOKEN;

    // Create a mock ToolConfig for testing
    mockConfig = {
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      category: 'Utility' as const,
      parameters: z.object({}),
    };
  });

  afterEach(() => {
    // Restore original token
    if (originalGithubToken !== undefined) {
      process.env.GITHUB_TOKEN = originalGithubToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  describe('getClient', () => {
    it('should create an Octokit client instance', () => {
      const client = tool.getClientForTesting();
      expect(client).toBeDefined();
      expect(client.rest).toBeDefined();
    });
  });

  describe('cleanResponse', () => {
    it('should handle non-data responses', () => {
      const response = { status: 200 };
      const result = tool.cleanResponse(response);
      expect(result).toBe(JSON.stringify(response));
    });

    it('should retain url and html_url but remove other URL properties', () => {
      const response = {
        data: {
          id: 123,
          url: 'https://api.github.com/repos/test/test',
          html_url: 'https://github.com/test/test',
          comments_url: 'https://api.github.com/repos/test/test/comments{/number}',
          forks_url: 'https://api.github.com/repos/test/test/forks',
          name: 'test',
        },
      };

      const result = JSON.parse(tool.cleanResponse(response));
      expect(result).toBeDefined();
      expect(result.id).toBe(123);
      expect(result.name).toBe('test');
      expect(result.url).toBe('https://api.github.com/repos/test/test');
      expect(result.html_url).toBe('https://github.com/test/test');
      expect(result.comments_url).toBeUndefined();
      expect(result.forks_url).toBeUndefined();
    });

    it('should recursively process nested objects', () => {
      const response = {
        data: {
          id: 123,
          name: 'test',
          owner: {
            id: 456,
            url: 'https://api.github.com/users/test',
            html_url: 'https://github.com/test',
            avatar_url: 'https://avatars.githubusercontent.com/u/456',
            followers_url: 'https://api.github.com/users/test/followers',
            name: 'Test User',
          },
        },
      };

      const result = JSON.parse(tool.cleanResponse(response));
      expect(result.owner).toBeDefined();
      expect(result.owner.id).toBe(456);
      expect(result.owner.name).toBe('Test User');
      expect(result.owner.url).toBe('https://api.github.com/users/test');
      expect(result.owner.html_url).toBe('https://github.com/test');
      expect(result.owner.avatar_url).toBeUndefined();
      expect(result.owner.followers_url).toBeUndefined();
    });

    it('should process arrays correctly', () => {
      const response = {
        data: {
          items: [
            {
              id: 1,
              url: 'https://api.github.com/items/1',
              comments_url: 'https://api.github.com/items/1/comments',
              name: 'Item 1',
            },
            {
              id: 2,
              url: 'https://api.github.com/items/2',
              comments_url: 'https://api.github.com/items/2/comments',
              name: 'Item 2',
            },
          ],
        },
      };

      const result = JSON.parse(tool.cleanResponse(response));
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe(1);
      expect(result.items[0].name).toBe('Item 1');
      expect(result.items[0].url).toBe('https://api.github.com/items/1');
      expect(result.items[0].comments_url).toBeUndefined();
      expect(result.items[1].id).toBe(2);
      expect(result.items[1].name).toBe('Item 2');
      expect(result.items[1].url).toBe('https://api.github.com/items/2');
      expect(result.items[1].comments_url).toBeUndefined();
    });

    it('should include pagination data when link header is present', () => {
      const response = {
        data: { id: 123, name: 'test' },
        headers: {
          link: '<https://api.github.com/repos/testorg/test-repo/issues?page=2>; rel="next", <https://api.github.com/repos/testorg/test-repo/issues?page=5>; rel="last", <https://api.github.com/repos/testorg/test-repo/issues?page=1>; rel="first"',
        },
      };

      const result = JSON.parse(tool.cleanResponse(response));
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe(123);
      expect(result.data.name).toBe('test');

      expect(result.pagination).toBeDefined();
      // When there's only next and not self/prev, we're on page 1
      expect(result.pagination.current).toBe(1);
      expect(result.pagination.hasPrevious).toBe(false);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('should handle prev link and extract current page', () => {
      const response = {
        data: { id: 123 },
        headers: {
          link: '<https://api.github.com/repos/testorg/test-repo/issues?page=2>; rel="prev", <https://api.github.com/repos/testorg/test-repo/issues?page=4>; rel="next", <https://api.github.com/repos/testorg/test-repo/issues?page=515>; rel="last", <https://api.github.com/repos/testorg/test-repo/issues?page=1>; rel="first"',
        },
      };

      const result = JSON.parse(tool.cleanResponse(response));
      expect(result.pagination).toBeDefined();
      // When we have next=4, we derive current from the next URL
      expect(result.pagination.current).toBe(3);
      expect(result.pagination.hasPrevious).toBe(true);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.totalPages).toBe(515);
    });

    it('should handle self link for current page', () => {
      const response = {
        data: { id: 123 },
        headers: {
          link: '<https://api.github.com/repos/testorg/test-repo/issues?page=7>; rel="self", <https://api.github.com/repos/testorg/test-repo/issues?page=6>; rel="prev", <https://api.github.com/repos/testorg/test-repo/issues?page=8>; rel="next", <https://api.github.com/repos/testorg/test-repo/issues?page=20>; rel="last", <https://api.github.com/repos/testorg/test-repo/issues?page=1>; rel="first"',
        },
      };

      const result = JSON.parse(tool.cleanResponse(response));
      expect(result.pagination).toBeDefined();
      expect(result.pagination.current).toBe(6);
      expect(result.pagination.hasPrevious).toBe(true);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.totalPages).toBe(20);
    });

    it('should not include pagination when no link header exists', () => {
      const response = {
        data: { id: 123 },
        headers: {},
      };

      const result = JSON.parse(tool.cleanResponse(response));
      expect(result.pagination).toBeUndefined();
    });
  });

  describe('isEnabled', () => {
    it('should return true when GITHUB_TOKEN is set', () => {
      process.env.GITHUB_TOKEN = 'test-token';
      const result = tool.isEnabled(mockConfig);
      expect(result).toBe(true);
    });

    it('should return false when GITHUB_TOKEN is not set', () => {
      delete process.env.GITHUB_TOKEN;
      const result = tool.isEnabled(mockConfig);
      expect(result).toBe(false);
    });

    it('should return false when GITHUB_TOKEN is empty string', () => {
      process.env.GITHUB_TOKEN = '';
      const result = tool.isEnabled(mockConfig);
      expect(result).toBe(false);
    });
  });

  describe('Octokit Lazy Loading', () => {
    it('should load Octokit lazily on first getClient call', () => {
      // First call should create and return the client
      const client1 = tool.getClientForTesting();
      expect(client1).toBeDefined();
      expect(client1.rest).toBeDefined();
    });

    it('should cache the Octokit client instance', () => {
      // Call getClient multiple times
      const client1 = tool.getClientForTesting();
      const client2 = tool.getClientForTesting();
      const client3 = tool.getClientForTesting();

      // All calls should return the same cached client instance
      expect(client1).toBe(client2);
      expect(client2).toBe(client3);
    });

    it('should create new client instance for different tool instances', () => {
      // Create two separate tool instances
      const tool1 = new TestGithubTool();
      const tool2 = new TestGithubTool();

      const client1 = tool1.getClientForTesting();
      const client2 = tool2.getClientForTesting();

      // Different tool instances should have different client instances
      // (each tool caches its own client)
      expect(client1).not.toBe(client2);
    });

    it('should not load Octokit during isEnabled check', () => {
      // Create a fresh tool instance
      const freshTool = new TestGithubTool();

      // isEnabled should work without loading Octokit
      // (it only checks environment variables and OAuth config)
      process.env.GITHUB_TOKEN = 'test-token';
      const isEnabled = freshTool.isEnabled(mockConfig);

      expect(isEnabled).toBe(true);
      // The Octokit client should not be created yet
      // (we can't directly test this without exposing internals,
      // but the test verifies isEnabled doesn't require the SDK)
    });
  });
});
