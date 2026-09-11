import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubUserReposListSchema, GithubUserReposListTool } from './list-user-repos-tool';

describe('GithubUserReposListTool', () => {
  let tool: GithubUserReposListTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.repos.listForUser.mockReset();
    mocks.repos.listForUser.mockImplementation(async () => ({
      data: [MOCK_DATA.repo],
    }));

    // Create a fresh instance for each test
    tool = new GithubUserReposListTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubUserReposListSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubUserReposListSchema.shape;
    expect(Object.keys(schemaShape)).toContain('username');
    expect(Object.keys(schemaShape)).toContain('type');
  });

  it('should correctly call GitHub API with required parameters', async () => {
    await tool.execute({
      username: 'testuser',
    });

    expect(mocks.repos.listForUser).toHaveBeenCalled();

    // Check that parameters were properly passed
    const apiParams = mocks.repos.listForUser.mock.calls[0][0];
    expect(apiParams).toEqual({
      username: 'testuser',
    } as any);
  });

  it('should correctly call GitHub API with optional type parameter', async () => {
    await tool.execute({
      username: 'testuser',
      type: 'owner',
    });

    expect(mocks.repos.listForUser).toHaveBeenCalled();

    // Check that parameters were properly passed
    const apiParams = mocks.repos.listForUser.mock.calls[0][0];
    expect(apiParams).toEqual({
      username: 'testuser',
      type: 'owner',
    } as any);
  });

  it('should return a JSON string with the repositories data', async () => {
    const result = await tool.execute({
      username: 'testuser',
      per_page: 10,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(Array.isArray(parsedResult.data)).toBe(true);
    expect(parsedResult.data.length).toBeGreaterThan(0);
    expect(parsedResult.data[0].name).toBe('test-repo');
    expect(parsedResult.data[0].full_name).toBe('testorg/test-repo');
  });

  it('should validate required parameters', () => {
    // Validate that schema correctly enforces required 'username' parameter
    const result = GithubUserReposListSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('username');
    }
  });

  it('should validate type parameter options', () => {
    // Validate that schema correctly enforces enum values for 'type' parameter
    const result = GithubUserReposListSchema.safeParse({
      username: 'testuser',
      type: 'invalid-type',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('type');
    }
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.repos.listForUser.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        username: 'testuser',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
