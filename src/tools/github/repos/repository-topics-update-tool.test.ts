import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import { MockUserError, setupStandardMocks } from '../../../test-utils/mocks';
import { mock } from 'bun:test';

// Set up standard mocks
setupStandardMocks();

// Import after mocks
import {
  GithubRepositoryTopicsUpdateTool,
  GithubRepositoryTopicsUpdateToolSchema,
  GithubRepositoryTopicsUpdateToolParams,
} from './repository-topics-update-tool';

describe('GithubRepositoryTopicsUpdateTool', () => {
  let tool: GithubRepositoryTopicsUpdateTool;
  let consoleLogSpy: ReturnType<typeof spyOn>;

  // Example valid parameters for testing
  const validReplaceParams: GithubRepositoryTopicsUpdateToolParams = {
    org: 'test-org',
    repo: 'test-repo',
    topics: ['topic1', 'topic2'],
    operation: 'replace',
  };

  const validAddParams: GithubRepositoryTopicsUpdateToolParams = {
    org: 'test-org',
    repo: 'test-repo',
    topics: ['topic3'],
    operation: 'add',
  };

  const validRemoveParams: GithubRepositoryTopicsUpdateToolParams = {
    org: 'test-org',
    repo: 'test-repo',
    topics: ['topic1'],
    operation: 'remove',
  };

  beforeEach(() => {
    tool = new GithubRepositoryTopicsUpdateTool();
    // Spy on console.log to prevent logs during tests
    consoleLogSpy = spyOn(console, 'log');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(tool).toBeDefined();
  });

  it('should execute with replace operation', async () => {
    // Mock the Octokit client
    const mockResponse = {
      data: { names: ['topic1', 'topic2'] },
      headers: {},
    };

    // Mock the getClient method to return a mock client
    const mockReplaceAllTopics = mock(() => Promise.resolve(mockResponse));
    const mockClient = {
      rest: {
        repos: {
          replaceAllTopics: mockReplaceAllTopics,
        },
      },
    };

    const getClientSpy = spyOn(tool as any, 'getClient').mockImplementation(
      () => mockClient as any,
    );

    const result = await tool.execute(validReplaceParams);

    // Verify client was called with the expected parameters
    expect(mockReplaceAllTopics).toHaveBeenCalledTimes(1);

    // Basic verification that the mock was called
    expect(mockReplaceAllTopics).toHaveBeenCalled();

    expect(result).toBeDefined();
    expect(JSON.parse(result)).toEqual({ names: ['topic1', 'topic2'] });

    getClientSpy.mockRestore();
  });

  it('should execute with add operation', async () => {
    // Mock the current topics response
    const mockGetResponse = {
      data: { names: ['topic1', 'topic2'] },
      headers: {},
    };

    const mockUpdateResponse = {
      data: { names: ['topic1', 'topic2', 'topic3'] },
      headers: {},
    };

    // Mock the client methods
    const mockGetAllTopics = mock(() => Promise.resolve(mockGetResponse));
    const mockReplaceAllTopics = mock(() => Promise.resolve(mockUpdateResponse));

    const mockClient = {
      rest: {
        repos: {
          getAllTopics: mockGetAllTopics,
          replaceAllTopics: mockReplaceAllTopics,
        },
      },
    };

    const getClientSpy = spyOn(tool as any, 'getClient').mockImplementation(
      () => mockClient as any,
    );

    const result = await tool.execute(validAddParams);

    // Verify client methods were called correctly
    expect(mockGetAllTopics).toHaveBeenCalledTimes(1);
    expect(mockGetAllTopics).toHaveBeenCalled();

    expect(mockReplaceAllTopics).toHaveBeenCalledTimes(1);
    expect(mockReplaceAllTopics).toHaveBeenCalled();

    expect(result).toBeDefined();
    expect(JSON.parse(result)).toEqual({
      names: ['topic1', 'topic2', 'topic3'],
    });

    getClientSpy.mockRestore();
  });

  it('should execute with remove operation', async () => {
    // Mock the current topics response
    const mockGetResponse = {
      data: { names: ['topic1', 'topic2'] },
      headers: {},
    };

    const mockUpdateResponse = {
      data: { names: ['topic2'] },
      headers: {},
    };

    // Mock the client methods
    const mockGetAllTopics = mock(() => Promise.resolve(mockGetResponse));
    const mockReplaceAllTopics = mock(() => Promise.resolve(mockUpdateResponse));

    const mockClient = {
      rest: {
        repos: {
          getAllTopics: mockGetAllTopics,
          replaceAllTopics: mockReplaceAllTopics,
        },
      },
    };

    const getClientSpy = spyOn(tool as any, 'getClient').mockImplementation(
      () => mockClient as any,
    );

    const result = await tool.execute(validRemoveParams);

    // Verify client methods were called correctly
    expect(mockGetAllTopics).toHaveBeenCalledTimes(1);
    expect(mockGetAllTopics).toHaveBeenCalled();

    expect(mockReplaceAllTopics).toHaveBeenCalledTimes(1);
    expect(mockReplaceAllTopics).toHaveBeenCalled();

    expect(result).toBeDefined();
    expect(JSON.parse(result)).toEqual({ names: ['topic2'] });

    getClientSpy.mockRestore();
  });

  it('should handle errors gracefully', async () => {
    // Mock the client to throw an error
    const mockReplaceAllTopics = mock(() => {
      throw new Error('API error');
    });

    const mockClient = {
      rest: {
        repos: {
          replaceAllTopics: mockReplaceAllTopics,
        },
      },
    };

    const getClientSpy = spyOn(tool as any, 'getClient').mockImplementation(
      () => mockClient as any,
    );

    try {
      await tool.execute(validReplaceParams);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error instanceof MockUserError).toBe(true);
      expect((error as Error).message).toContain('Tool execution error: API error');
    }

    getClientSpy.mockRestore();
  });

  describe('schema validation', () => {
    it('should validate correct parameters', () => {
      const result = GithubRepositoryTopicsUpdateToolSchema.safeParse(validReplaceParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const invalidParams = {
        org: 'test-org',
        repo: 'test-repo',
        topics: 'not-an-array', // Should be an array
        operation: 'invalid-op', // Invalid operation
      };
      const result = GithubRepositoryTopicsUpdateToolSchema.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should use default replace operation when not specified', () => {
      const paramsWithoutOperation = {
        org: 'test-org',
        repo: 'test-repo',
        topics: ['topic1', 'topic2'],
      };
      const result = GithubRepositoryTopicsUpdateToolSchema.safeParse(paramsWithoutOperation);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.operation).toBe('replace');
      }
    });
  });

  // Add more test cases as needed
});
