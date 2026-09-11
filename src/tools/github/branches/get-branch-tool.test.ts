import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubGetBranchSchema, GithubGetBranchTool } from './get-branch-tool';

describe('GithubGetBranchTool', () => {
  let tool: GithubGetBranchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.getBranch.mockReset();
    mocks.repos.getBranch.mockImplementation(async () => ({
      data: MOCK_DATA.branch,
    }));

    // Create a fresh instance for each test
    tool = new GithubGetBranchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubGetBranchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubGetBranchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('branch');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      branch: 'main',
    });

    expect(mocks.repos.getBranch).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.repos.getBranch.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      branch: 'main',
    } as any);
  });

  it('should return a JSON string with the branch data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      branch: 'main',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.name).toBe(MOCK_DATA.branch.name);
    expect(parsedResult.commit).toBeDefined();
    expect(parsedResult.commit.sha).toBe(MOCK_DATA.branch.commit.sha);
    expect(parsedResult.protected).toBe(MOCK_DATA.branch.protected);
    expect(parsedResult.protection).toBeDefined();
  });

  it('should throw an error for missing required fields', async () => {
    let error;
    try {
      // Missing branch field
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for completely invalid input', async () => {
    let error;
    try {
      // Missing all required fields
      await tool.execute({} as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.repos.getBranch.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        branch: 'main',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
