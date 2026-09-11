import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubMyOrgsListSchema, GithubMyOrgsListTool } from './list-my-orgs-tool';

describe('GithubMyOrgsListTool', () => {
  let tool: GithubMyOrgsListTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.orgs.listForUser.mockReset();
    mocks.orgs.listForAuthenticatedUser.mockReset();

    mocks.orgs.listForUser.mockImplementation(async () => ({
      data: MOCK_DATA.orgs,
    }));

    mocks.orgs.listForAuthenticatedUser.mockImplementation(async () => ({
      data: MOCK_DATA.orgs,
    }));

    // Create a fresh instance for each test
    tool = new GithubMyOrgsListTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubMyOrgsListSchema).toBeDefined();
    const schemaShape = GithubMyOrgsListSchema.shape;
    expect(Object.keys(schemaShape)).toContain('username');
  });

  it('should call listForUser API with username when provided', async () => {
    await tool.execute({ username: 'testuser' });

    expect(mocks.orgs.listForUser).toHaveBeenCalled();
    expect(mocks.orgs.listForAuthenticatedUser).not.toHaveBeenCalled();

    const apiParams = mocks.orgs.listForUser.mock.calls[0][0];
    expect(apiParams).toEqual({ username: 'testuser' });
  });

  it('should call listForAuthenticatedUser API when no username is provided', async () => {
    await tool.execute({});

    expect(mocks.orgs.listForAuthenticatedUser).toHaveBeenCalled();
    expect(mocks.orgs.listForUser).not.toHaveBeenCalled();

    const apiParams = mocks.orgs.listForAuthenticatedUser.mock.calls[0][0];
    expect(apiParams).toEqual({});
  });

  it('should return a JSON string with the organizations data using username', async () => {
    const result = await tool.execute({ username: 'testuser' });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    // Just test that the result is a string that can be parsed as JSON
    expect(typeof result).toBe('string');
  });

  it('should return a JSON string with the organizations data for authenticated user', async () => {
    const result = await tool.execute({});

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    // Just test that the result is a string that can be parsed as JSON
    expect(typeof result).toBe('string');
  });

  it('should handle API errors gracefully when using username', async () => {
    // Mock the API call to throw an error
    mocks.orgs.listForUser.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({ username: 'testuser' });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });

  it('should handle API errors gracefully when using authenticated user', async () => {
    // Mock the API call to throw an error
    mocks.orgs.listForAuthenticatedUser.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({});
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
