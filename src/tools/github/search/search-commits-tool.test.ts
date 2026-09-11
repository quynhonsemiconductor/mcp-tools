import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Set up specific mock for search.commits
mocks.search.commits.mockImplementation(async () => ({
  data: MOCK_DATA.commitsSearchResults,
}));

// Import after mocking modules
import { GithubCommitsSearchSchema, GithubCommitsSearchTool } from './search-commits-tool';

describe('GithubCommitsSearchTool', () => {
  let tool: GithubCommitsSearchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    if (mocks.search.commits) {
      mocks.search.commits.mockReset();
      mocks.search.commits.mockImplementation(async () => ({
        data: MOCK_DATA.commitsSearchResults,
      }));
    }

    // Create a fresh instance for each test
    tool = new GithubCommitsSearchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubCommitsSearchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubCommitsSearchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('q');
    expect(Object.keys(schemaShape)).toContain('per_page');
    expect(Object.keys(schemaShape)).toContain('page');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      q: 'author:username',
    });

    expect(mocks.search.commits).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.commits.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'author:username',
      per_page: 10,
      page: 1,
    });
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      q: 'author:username',
      per_page: 30,
      page: 2,
    });

    expect(mocks.search.commits).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.commits.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'author:username',
      per_page: 30,
      page: 2,
    });
  });

  it('should return a JSON string with the search results data', async () => {
    const result = await tool.execute({
      q: 'author:username',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(parsedResult.data.total_count).toBe(2);
    expect(Array.isArray(parsedResult.data.items)).toBe(true);
    expect(parsedResult.data.items.length).toBe(2);
    expect(parsedResult.data.items[0].sha).toBe('1234567890abcdef');
    expect(parsedResult.data.items[1].sha).toBe('abcdef1234567890');
    expect(parsedResult.data.items[0].commit.message).toBe('First commit message');
    expect(parsedResult.data.items[1].commit.message).toBe('Second commit message');
  });

  it('should throw an error for invalid input', async () => {
    let error;
    try {
      // Missing required fields
      await tool.execute({} as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error when query is empty', async () => {
    let error;
    try {
      await tool.execute({
        q: '', // Empty query
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.search.commits?.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        q: 'author:username',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
