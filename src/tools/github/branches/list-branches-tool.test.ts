import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubListBranchesSchema, GithubListBranchesTool } from './list-branches-tool';

describe('GithubListBranchesTool', () => {
  let tool: GithubListBranchesTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.listBranches.mockReset();
    mocks.repos.listBranches.mockImplementation(async () => ({
      data: MOCK_DATA.branches,
    }));

    // Create a fresh instance for each test
    tool = new GithubListBranchesTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubListBranchesSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubListBranchesSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
    });

    expect(mocks.repos.listBranches).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.repos.listBranches.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
    } as any);
  });

  it('should return a JSON string with the branches data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.data).toHaveLength(MOCK_DATA.branches.length);
    expect(parsedResult.data[0].name).toBe(MOCK_DATA.branches[0].name);
    expect(parsedResult.data[1].name).toBe(MOCK_DATA.branches[1].name);
    expect(parsedResult.data[0].commit.sha).toBe(MOCK_DATA.branches[0].commit.sha);
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

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.repos.listBranches.mockImplementation(() => {
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
