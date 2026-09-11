import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestMergeSchema,
  GithubPullRequestMergeTool,
} from './merge-pull-request-tool';

describe('GithubPullRequestMergeTool', () => {
  let tool: GithubPullRequestMergeTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.merge.mockReset();
    mocks.pulls.merge.mockImplementation(async () => ({
      data: { merged: true },
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestMergeTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestMergeSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestMergeSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
    expect(Object.keys(schemaShape)).toContain('commit_title');
    expect(Object.keys(schemaShape)).toContain('commit_message');
    expect(Object.keys(schemaShape)).toContain('merge_method');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(mocks.pulls.merge).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.pulls.merge.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    } as any);
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      commit_title: 'Merge pull request #27',
      commit_message: 'This is a detailed commit message',
      merge_method: 'squash',
    });

    expect(mocks.pulls.merge).toHaveBeenCalled();

    // Check that all parameters were passed correctly
    const apiParams = mocks.pulls.merge.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      commit_title: 'Merge pull request #27',
      commit_message: 'This is a detailed commit message',
      merge_method: 'squash',
    } as any);
  });

  it('should return a JSON string with the merge result', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.merged).toBe(true);
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

  it('should throw an error for invalid merge_method', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: 27,
        merge_method: 'invalid' as any,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.pulls.merge.mockImplementation(() => {
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
