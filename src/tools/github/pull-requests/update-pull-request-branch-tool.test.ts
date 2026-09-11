import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestUpdateBranchSchema,
  GithubPullRequestUpdateBranchTool,
} from './update-pull-request-branch-tool';

describe('GithubPullRequestUpdateBranchTool', () => {
  let tool: GithubPullRequestUpdateBranchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.updateBranch.mockReset();
    mocks.pulls.updateBranch.mockImplementation(async () => ({
      data: { message: 'Branch was successfully updated' },
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestUpdateBranchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestUpdateBranchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestUpdateBranchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
    expect(Object.keys(schemaShape)).toContain('expected_head_sha');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(mocks.pulls.updateBranch).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.pulls.updateBranch.mock.calls[0][0];
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
      expected_head_sha: '1234567890abcdef',
    });

    expect(mocks.pulls.updateBranch).toHaveBeenCalled();

    // Check that all parameters were passed correctly
    const apiParams = mocks.pulls.updateBranch.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      expected_head_sha: '1234567890abcdef',
    } as any);
  });

  it('should return a JSON string with the update result', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.message).toBe('Branch was successfully updated');
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
    mocks.pulls.updateBranch.mockImplementation(() => {
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
