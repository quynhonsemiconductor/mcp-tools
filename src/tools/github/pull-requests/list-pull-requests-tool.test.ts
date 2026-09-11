import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubPullRequestListSchema, GithubPullRequestListTool } from './list-pull-requests-tool';

describe('GithubPullRequestListTool', () => {
  let tool: GithubPullRequestListTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.list.mockReset();
    mocks.pulls.list.mockImplementation(async () => ({
      data: [MOCK_DATA.pullRequest],
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestListTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestListSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestListSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('state');
    expect(Object.keys(schemaShape)).toContain('sort');
    expect(Object.keys(schemaShape)).toContain('direction');
    expect(Object.keys(schemaShape)).toContain('per_page');
    expect(Object.keys(schemaShape)).toContain('page');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      per_page: 30,
    });

    expect(mocks.pulls.list).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.pulls.list.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      per_page: 30,
    } as any);
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      state: 'open',
      sort: 'created',
      direction: 'desc',
      per_page: 50,
      page: 2,
    });

    expect(mocks.pulls.list).toHaveBeenCalled();

    // Check that parameters were properly transformed
    const apiParams = mocks.pulls.list.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      state: 'open',
      sort: 'created',
      direction: 'desc',
      per_page: 50, // Note transformation from perPage to per_page
      page: 2,
    } as any);
  });

  it('should return a JSON string with the pull requests data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(Array.isArray(parsedResult.data)).toBe(true);
    expect(parsedResult.data.length).toBeGreaterThan(0);
    expect(parsedResult.data[0].number).toBe(27);
    expect(parsedResult.data[0].title).toBe('Test PR');
    expect(parsedResult.data[0].state).toBe('open');
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

  it('should throw an error for invalid state value', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        state: 'invalid' as any,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.pulls.list.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
