import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestCommentsSchema,
  GithubPullRequestCommentsTool,
} from './get-pull-request-comments-tool';

describe('GithubPullRequestCommentsTool', () => {
  let tool: GithubPullRequestCommentsTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.listReviewComments.mockReset();
    mocks.pulls.listReviewComments.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequestComments,
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestCommentsTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestCommentsSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestCommentsSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      per_page: 10,
    });

    expect(mocks.pulls.listReviewComments).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.pulls.listReviewComments.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      per_page: 10,
    } as any);
  });

  it('should return a JSON string with the pull request comments data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      per_page: 10,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(Array.isArray(parsedResult.data)).toBe(true);
    expect(parsedResult.data.length).toBe(2);
    expect(parsedResult.data[0].body).toBe('Comment on the pull request');
    expect(parsedResult.data[0].user.login).toBe('reviewer1');
    expect(parsedResult.data[1].body).toBe('Another comment on the PR');
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
        per_page: 10,
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
    mocks.pulls.listReviewComments.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: 27,
        per_page: 10,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
