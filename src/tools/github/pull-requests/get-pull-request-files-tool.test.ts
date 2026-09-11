import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestFilesSchema,
  GithubPullRequestFilesTool,
} from './get-pull-request-files-tool';

describe('GithubPullRequestFilesTool', () => {
  let tool: GithubPullRequestFilesTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.listFiles.mockReset();
    mocks.pulls.listFiles.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequestFiles,
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestFilesTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestFilesSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestFilesSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
    expect(Object.keys(schemaShape)).toContain('per_page');
    expect(Object.keys(schemaShape)).toContain('page');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(mocks.pulls.listFiles).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    // per_page defaults to 30
    const apiParams = mocks.pulls.listFiles.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      per_page: 30,
    } as any);
  });

  it('should forward per_page and page params to the API', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      per_page: 100,
      page: 2,
    });

    const apiParams = mocks.pulls.listFiles.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      per_page: 100,
      page: 2,
    } as any);
  });

  it('should return a JSON string with the pull request files data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(Array.isArray(parsedResult)).toBe(true);
    expect(parsedResult.length).toBe(2);
    expect(parsedResult[0].filename).toBe('src/index.js');
    expect(parsedResult[0].status).toBe('modified');
    expect(parsedResult[1].filename).toBe('README.md');
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
    mocks.pulls.listFiles.mockImplementation(() => {
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
