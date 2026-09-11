import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestStatusSchema,
  GithubPullRequestStatusTool,
} from './get-pull-request-status-tool';

describe('GithubPullRequestStatusTool', () => {
  let tool: GithubPullRequestStatusTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.get.mockReset();
    mocks.repos.getCombinedStatusForRef.mockReset();

    mocks.pulls.get.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequest,
    }));
    mocks.repos.getCombinedStatusForRef.mockImplementation(async () => ({
      data: MOCK_DATA.combinedStatus,
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestStatusTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestStatusSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestStatusSchema.shape;
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
    expect(mocks.repos.getCombinedStatusForRef).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner) for pull request
    const pullApiParams = mocks.pulls.get.mock.calls[0][0];
    expect(pullApiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    } as any);

    // Check that parameters for status include the correct SHA
    const statusApiParams = mocks.repos.getCombinedStatusForRef.mock.calls[0][0];
    expect(statusApiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      ref: '1234567890abcdef', // SHA from mock pull request data
    } as any);
  });

  it('should return a JSON string with the pull request status data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.state).toBe('success');
    expect(parsedResult.statuses).toBeDefined();
    expect(Array.isArray(parsedResult.statuses)).toBe(true);
    expect(parsedResult.statuses.length).toBe(2);
    expect(parsedResult.statuses[0].context).toBe('ci/travis');
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

  it('should handle API errors when getting pull request', async () => {
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

  it('should handle API errors when getting status', async () => {
    // Mock the API call to throw an error
    mocks.repos.getCombinedStatusForRef.mockImplementation(() => {
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
