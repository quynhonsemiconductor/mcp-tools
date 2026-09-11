import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubMergeBranchSchema, GithubMergeBranchTool } from './merge-branch-tool';

describe('GithubMergeBranchTool', () => {
  let tool: GithubMergeBranchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.merge.mockReset();
    mocks.repos.merge.mockImplementation(async () => ({
      data: MOCK_DATA.mergeResponse,
    }));

    // Create a fresh instance for each test
    tool = new GithubMergeBranchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubMergeBranchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubMergeBranchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('base');
    expect(Object.keys(schemaShape)).toContain('head');
    expect(Object.keys(schemaShape)).toContain('commit_message');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      base: 'main',
      head: 'feature-branch',
    });

    expect(mocks.repos.merge).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.repos.merge.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      base: 'main',
      head: 'feature-branch',
    } as any);
  });

  it('should include optional commit_message when provided', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      base: 'main',
      head: 'feature-branch',
      commit_message: 'Merging feature branch',
    });

    expect(mocks.repos.merge).toHaveBeenCalled();

    // Check that all parameters were passed correctly
    const apiParams = mocks.repos.merge.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      base: 'main',
      head: 'feature-branch',
      commit_message: 'Merging feature branch',
    } as any);
  });

  it('should return a JSON string with the merged branch data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      base: 'main',
      head: 'feature-branch',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.sha).toBe(MOCK_DATA.mergeResponse.sha);
    expect(parsedResult.merged).toBe(MOCK_DATA.mergeResponse.merged);
    expect(parsedResult.message).toBe(MOCK_DATA.mergeResponse.message);
  });

  it('should throw an error for missing head field', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        base: 'main',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for missing base field', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        head: 'feature-branch',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.repos.merge.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        base: 'main',
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
