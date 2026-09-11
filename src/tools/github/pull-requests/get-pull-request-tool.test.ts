import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubPullRequestGetSchema, GithubPullRequestGetTool } from './get-pull-request-tool';

describe('GithubPullRequestGetTool', () => {
  let tool: GithubPullRequestGetTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.get.mockReset();
    mocks.pulls.get.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequest,
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestGetTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestGetSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestGetSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(mocks.pulls.get).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.pulls.get.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    } as any);
  });

  it('should return a JSON string with the pull request data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.number).toBe(27);
    expect(parsedResult.title).toBe('Test PR');
    expect(parsedResult.state).toBe('open');
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

  it('should throw an error when pull_number is not a positive integer', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: -5, // Negative number
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.pulls.get.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: 27,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
