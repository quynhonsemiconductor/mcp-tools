import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubIssuesUpdateSchema, GithubIssuesUpdateTool } from './update-issue-tool';

describe('GithubIssuesUpdateTool', () => {
  let tool: GithubIssuesUpdateTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.issues.update.mockReset();
    mocks.issues.update.mockImplementation(async () => ({
      data: MOCK_DATA.issue,
    }));

    // Create a fresh instance for each test
    tool = new GithubIssuesUpdateTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesUpdateSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubIssuesUpdateSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('issue_number');
    expect(Object.keys(schemaShape)).toContain('title');
    expect(Object.keys(schemaShape)).toContain('body');
    expect(Object.keys(schemaShape)).toContain('state');
    expect(Object.keys(schemaShape)).toContain('labels');
    expect(Object.keys(schemaShape)).toContain('assignees');
    expect(Object.keys(schemaShape)).toContain('milestone');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
    });

    expect(mocks.issues.update).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.issues.update.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
    } as any);
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
      title: 'Updated Title',
      body: 'Updated description',
      state: 'closed',
      labels: ['bug', 'fixed'],
      assignees: ['user1', 'user2'],
      milestone: 5,
    });

    expect(mocks.issues.update).toHaveBeenCalled();

    // Check that all parameters were passed
    const apiParams = mocks.issues.update.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
      title: 'Updated Title',
      body: 'Updated description',
      state: 'closed',
      labels: ['bug', 'fixed'],
      assignees: ['user1', 'user2'],
      milestone: 5,
    } as any);
  });

  it('should return a JSON string with the updated issue data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
      state: 'closed',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.number).toBe(42);
    expect(parsedResult.title).toBe('Test Issue');
    expect(parsedResult.state).toBe('open'); // Note: This is the mock state, not what we sent
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

  it('should throw an error when issue_number is not a positive integer', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: -5, // Negative number
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for invalid state value', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 42,
        state: 'invalid' as any,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.issues.update.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 42,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
