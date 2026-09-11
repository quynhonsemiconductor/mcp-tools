import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Set up specific mock for search.repos
mocks.search.repos.mockImplementation(async () => ({
  data: MOCK_DATA.reposSearchResults,
}));

// Import after mocking modules
import { GithubReposSearchSchema, GithubReposSearchTool } from './search-repos-tool';

describe('GithubReposSearchTool', () => {
  let tool: GithubReposSearchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    if (mocks.search.repos) {
      mocks.search.repos.mockReset();
      mocks.search.repos.mockImplementation(async () => ({
        data: MOCK_DATA.reposSearchResults,
      }));
    }

    // Create a fresh instance for each test
    tool = new GithubReposSearchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubReposSearchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubReposSearchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('q');
    expect(Object.keys(schemaShape)).toContain('per_page');
    expect(Object.keys(schemaShape)).toContain('page');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      q: 'org:testorg language:typescript',
    });

    expect(mocks.search.repos).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.repos.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'org:testorg language:typescript',
      per_page: 10,
      page: 1,
    });
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      q: 'org:testorg language:typescript',
      per_page: 30,
      page: 2,
    });

    expect(mocks.search.repos).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.repos.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'org:testorg language:typescript',
      per_page: 30,
      page: 2,
    });
  });

  it('should return a JSON string with the search results data', async () => {
    const result = await tool.execute({
      q: 'org:testorg language:typescript',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(parsedResult.data.total_count).toBe(2);
    expect(Array.isArray(parsedResult.data.items)).toBe(true);
    expect(parsedResult.data.items.length).toBe(2);
    expect(parsedResult.data.items[0].name).toBe('test-repo');
    expect(parsedResult.data.items[1].name).toBe('another-repo');
    expect(parsedResult.data.items[0].language).toBe('TypeScript');
    expect(parsedResult.data.items[1].language).toBe('JavaScript');
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
    mocks.search.repos?.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        q: 'org:testorg language:typescript',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
