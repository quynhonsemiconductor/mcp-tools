import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Set up specific mock for search.code
mocks.search.code.mockImplementation(async () => ({
  data: MOCK_DATA.codeSearchResults,
}));

// Import after mocking modules
import { GithubCodeSearchSchema, GithubCodeSearchTool } from './search-code-tool';

describe('GithubCodeSearchTool', () => {
  let tool: GithubCodeSearchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    if (mocks.search.code) {
      mocks.search.code.mockReset();
      mocks.search.code.mockImplementation(async () => ({
        data: MOCK_DATA.codeSearchResults,
      }));
    }

    // Create a fresh instance for each test
    tool = new GithubCodeSearchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubCodeSearchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubCodeSearchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('q');
    expect(Object.keys(schemaShape)).toContain('per_page');
    expect(Object.keys(schemaShape)).toContain('page');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      q: 'function in:file language:javascript',
    });

    expect(mocks.search.code).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.code.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'function in:file language:javascript',
      per_page: 10,
      page: 1,
    });
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      q: 'function in:file language:javascript',
      per_page: 30,
      page: 2,
    });

    expect(mocks.search.code).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.search.code.mock.calls[0][0];
    expect(apiParams).toEqual({
      q: 'function in:file language:javascript',
      per_page: 30,
      page: 2,
    });
  });

  it('should return a JSON string with the search results data', async () => {
    const result = await tool.execute({
      q: 'function in:file language:javascript',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(parsedResult.data.total_count).toBe(2);
    expect(Array.isArray(parsedResult.data.items)).toBe(true);
    expect(parsedResult.data.items.length).toBe(2);
    expect(parsedResult.data.items[0].name).toBe('file1.js');
    expect(parsedResult.data.items[1].name).toBe('file2.js');
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
    mocks.search.code?.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        q: 'function in:file language:javascript',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
