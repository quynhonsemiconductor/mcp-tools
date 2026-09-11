import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubOrgsListSchema, GithubOrgsListTool } from './list-orgs-tool';

describe('GithubOrgsListTool', () => {
  let tool: GithubOrgsListTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.orgs.list.mockReset();
    mocks.orgs.list.mockImplementation(async () => ({
      data: MOCK_DATA.orgs,
    }));

    // Create a fresh instance for each test
    tool = new GithubOrgsListTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubOrgsListSchema).toBeDefined();
    const schemaShape = GithubOrgsListSchema.shape;
    expect(Object.keys(schemaShape).sort()).toEqual(['per_page', 'since']);
  });

  it('should correctly call GitHub API', async () => {
    await tool.execute({});

    expect(mocks.orgs.list).toHaveBeenCalled();
    const apiParams = mocks.orgs.list.mock.calls[0][0];
    expect(apiParams).toEqual({});
  });

  it('should pass since and per_page parameters for cursor-based pagination', async () => {
    await tool.execute({ since: 1234567, per_page: 20 });

    expect(mocks.orgs.list).toHaveBeenCalled();
    const apiParams = mocks.orgs.list.mock.calls[0][0];
    expect(apiParams).toEqual({ since: 1234567, per_page: 20 });
  });

  it('should return a JSON string with the organizations data', async () => {
    const result = await tool.execute({});

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    // Just test that the result is a string that can be parsed as JSON
    expect(typeof result).toBe('string');
  });

  it('should return plain data array without pagination wrapper', async () => {
    const result = await tool.execute({});

    const parsedResult = JSON.parse(result);
    // Cursor-based pagination does not use the page-based pagination wrapper
    expect(Array.isArray(parsedResult)).toBe(true);
    expect(parsedResult).not.toHaveProperty('pagination');
    expect(parsedResult).not.toHaveProperty('data');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.orgs.list.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({});
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
