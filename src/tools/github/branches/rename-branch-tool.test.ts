import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubRenameBranchSchema, GithubRenameBranchTool } from './rename-branch-tool';

describe('GithubRenameBranchTool', () => {
  let tool: GithubRenameBranchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.renameBranch.mockReset();
    mocks.repos.renameBranch.mockImplementation(async () => ({
      data: MOCK_DATA.renameBranchResponse,
    }));

    // Create a fresh instance for each test
    tool = new GithubRenameBranchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubRenameBranchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubRenameBranchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('branch');
    expect(Object.keys(schemaShape)).toContain('new_name');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      branch: 'feature-branch',
      new_name: 'new-branch-name',
    });

    expect(mocks.repos.renameBranch).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.repos.renameBranch.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      branch: 'feature-branch',
      new_name: 'new-branch-name',
    } as any);
  });

  it('should return a JSON string with the renamed branch data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      branch: 'feature-branch',
      new_name: 'new-branch-name',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.name).toBe(MOCK_DATA.renameBranchResponse.name);
    expect(parsedResult.commit).toBeDefined();
    expect(parsedResult.commit.sha).toBe(MOCK_DATA.renameBranchResponse.commit.sha);
    expect(parsedResult.protected).toBe(MOCK_DATA.renameBranchResponse.protected);
  });

  it('should throw an error for missing branch field', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        new_name: 'new-branch-name',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for missing new_name field', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        branch: 'feature-branch',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.repos.renameBranch.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        branch: 'feature-branch',
        new_name: 'new-branch-name',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
