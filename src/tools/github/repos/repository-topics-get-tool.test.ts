import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import { MockUserError, setupStandardMocks } from '../../../test-utils/mocks';
import { mock } from 'bun:test';

// Set up standard mocks
setupStandardMocks();

// Import after mocks
import {
  GithubRepositoryTopicsGetTool,
  GithubRepositoryTopicsGetToolSchema,
  GithubRepositoryTopicsGetToolParams,
} from './repository-topics-get-tool';

describe('GithubRepositoryTopicsGetTool', () => {
  let tool: GithubRepositoryTopicsGetTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  // Example valid parameters for testing
  const validParams: GithubRepositoryTopicsGetToolParams = {
    org: 'test-org',
    repo: 'test-repo',
  };

  beforeEach(() => {
    tool = new GithubRepositoryTopicsGetTool();
    // Spy on console.log to prevent logs during tests
    consoleLogSpy = spyOn(console, 'log');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  it('should execute with valid parameters', async () => {
    // Mock the Octokit client
    const mockResponse = {
      data: { names: ['topic1', 'topic2'] },
      headers: {},
    };

    // Mock the getClient method to return a mock client with repos.getAllTopics
    const mockGetAllTopics = mock(() => Promise.resolve(mockResponse));
    const mockClient = {
      rest: {
        repos: {
          getAllTopics: mockGetAllTopics,
        },
      },
    };

    const getClientSpy = spyOn(tool as any, 'getClient').mockImplementation(
      () => mockClient as any,
    );

    const result = await tool.execute(validParams);

    // Verify client was called with correct parameters
    expect(mockGetAllTopics).toHaveBeenCalledWith({
      owner: 'test-org',
      repo: 'test-repo',
    });

    expect(result).toBeDefined();
    expect(JSON.parse(result)).toEqual({ names: ['topic1', 'topic2'] });

    getClientSpy.mockRestore();
  });

  it('should handle errors gracefully', async () => {
    // Mock the Octokit client to throw an error
    const mockGetAllTopics = mock(() => {
      throw new Error('API error');
    });

    const mockClient = {
      rest: {
        repos: {
          getAllTopics: mockGetAllTopics,
        },
      },
    };

    const getClientSpy = spyOn(tool as any, 'getClient').mockImplementation(
      () => mockClient as any,
    );

    try {
      await tool.execute(validParams);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error instanceof MockUserError).toBe(true);
      expect((error as Error).message).toContain('Tool execution error: API error');
    }

    getClientSpy.mockRestore();
  });

  describe('schema validation', () => {
    it('should validate correct parameters', () => {
      const result = GithubRepositoryTopicsGetToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        // Missing required parameters
        repo: 'test-repo',
        // Missing org
      };
      const result = GithubRepositoryTopicsGetToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  // Add more test cases as needed
});
