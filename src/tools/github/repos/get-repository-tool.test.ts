import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubRepositoryGetSchema, GithubRepositoryGetTool } from './get-repository-tool';

describe('GithubRepositoryGetTool', () => {
  let tool: GithubRepositoryGetTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.get.mockReset();
    mocks.repos.get.mockImplementation(async () => ({
      data: MOCK_DATA.repo,
    }));

    // Create a fresh instance for each test
    tool = new GithubRepositoryGetTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubRepositoryGetSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubRepositoryGetSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
  });

  it('should correctly call GitHub API with required parameters', async () => {
    await tool.execute({
      org: 'testowner',
      repo: 'testrepo',
    });

    expect(mocks.repos.get).toHaveBeenCalled();

    // Check that parameters were properly passed
    const apiParams = mocks.repos.get.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testowner',
      repo: 'testrepo',
    } as any);
  });

  it('should return a JSON string with the repository data', async () => {
    const result = await tool.execute({
      org: 'testowner',
      repo: 'testrepo',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.name).toBe('test-repo');
    expect(parsedResult.full_name).toBe('testorg/test-repo');
  });

  it('should validate required parameters', () => {
    // Validate that schema correctly enforces required parameters
    const result1 = GithubRepositoryGetSchema.safeParse({});
    expect(result1.success).toBe(false);
    if (!result1.success) {
      expect(result1.error.issues.some((issue) => issue.path.includes('org'))).toBe(true);
    }

    const result2 = GithubRepositoryGetSchema.safeParse({ org: 'testowner' });
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.issues.some((issue) => issue.path.includes('repo'))).toBe(true);
    }
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.repos.get.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testowner',
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
