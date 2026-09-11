import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestCreateSchema,
  GithubPullRequestCreateTool,
} from './create-pull-request-tool';

describe('GithubPullRequestCreateTool', () => {
  let tool: GithubPullRequestCreateTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.create.mockReset();
    mocks.pulls.create.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequest,
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestCreateTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestCreateSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestCreateSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('head');
    expect(Object.keys(schemaShape)).toContain('base');
    expect(Object.keys(schemaShape)).toContain('title');
    expect(Object.keys(schemaShape)).toContain('body');
    expect(Object.keys(schemaShape)).toContain('draft');
    expect(Object.keys(schemaShape)).toContain('maintainer_can_modify');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      title: 'Test PR',
      head: 'feature-branch',
      base: 'main',
      body: 'PR description',
      draft: false,
    });

    expect(mocks.pulls.create).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.pulls.create.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      title: 'Test PR',
      head: 'feature-branch',
      base: 'main',
      body: 'PR description',
      draft: false,
      maintainer_can_modify: true,
    } as any);
  });

  it('should return a JSON string with the created pull request data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      title: 'Test PR',
      head: 'feature-branch',
      base: 'main',
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

  it('should use default base branch if not specified', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      title: 'Test PR',
      head: 'feature-branch',
    });

    const apiParams = mocks.pulls.create.mock.calls[0][0];
    expect(apiParams).toEqual(expect.objectContaining({ base: 'main' })); // Default value should be 'main'
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.pulls.create.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        title: 'Test PR',
        head: 'feature-branch',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
