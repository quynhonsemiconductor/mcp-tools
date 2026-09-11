import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubIssuesSearchSchema, GithubIssuesSearchTool } from './search-issues-tool';

describe('GithubIssuesSearchTool', () => {
  let tool: GithubIssuesSearchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.search.issuesAndPullRequests.mockReset();
    mocks.search.issuesAndPullRequests.mockImplementation(async () => ({
      data: MOCK_DATA.searchResults,
    }));

    // Create a fresh instance for each test
    tool = new GithubIssuesSearchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesSearchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubIssuesSearchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('query');
    expect(Object.keys(schemaShape)).toContain('sort');
    expect(Object.keys(schemaShape)).toContain('order');
    expect(Object.keys(schemaShape)).toContain('page');
    expect(Object.keys(schemaShape)).toContain('per_page');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      query: 'is:issue is:open label:bug',
      per_page: 30,
    });

    expect(mocks.search.issuesAndPullRequests).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.issuesAndPullRequests.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'is:issue is:open label:bug',
      per_page: 30,
    } as any);
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      query: 'is:issue is:open label:bug',
      sort: 'created',
      order: 'desc',
      page: 2,
      per_page: 30,
    });

    expect(mocks.search.issuesAndPullRequests).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.issuesAndPullRequests.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'is:issue is:open label:bug',
      sort: 'created',
      order: 'desc',
      page: 2,
      per_page: 30,
    } as any);
  });

  it('should return a JSON string with the search results data', async () => {
    const result = await tool.execute({
      query: 'is:issue is:open label:bug',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(parsedResult.data.total_count).toBe(2);
    expect(parsedResult.data.items).toBeArray();
    expect(parsedResult.data.items.length).toBe(2);
    expect(parsedResult.data.items[0].title).toBe('Test Issue');
    expect(parsedResult.data.items[1].title).toBe('Another Test Issue');
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
        query: '', // Empty query
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for invalid sort value', async () => {
    let error;
    try {
      await tool.execute({
        query: 'is:issue is:open',
        sort: 'invalid' as any,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.search.issuesAndPullRequests.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        query: 'is:issue is:open',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
