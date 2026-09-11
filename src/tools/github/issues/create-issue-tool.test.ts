import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubIssuesCreateSchema, GithubIssuesCreateTool } from './create-issue-tool';

describe('GithubIssuesCreateTool', () => {
  let tool: GithubIssuesCreateTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.issues.create.mockReset();
    mocks.issues.create.mockImplementation(async () => ({
      data: MOCK_DATA.issue,
    }));

    // Create a fresh instance for each test
    tool = new GithubIssuesCreateTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesCreateSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubIssuesCreateSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('title');
    expect(Object.keys(schemaShape)).toContain('body');
    expect(Object.keys(schemaShape)).toContain('assignees');
    expect(Object.keys(schemaShape)).toContain('labels');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      title: 'New Issue Title',
      body: 'Issue description',
      assignees: ['user1', 'user2'],
      labels: ['bug', 'help wanted'],
    });

    expect(mocks.issues.create).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.issues.create.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      title: 'New Issue Title',
      body: 'Issue description',
      assignees: ['user1', 'user2'],
      labels: ['bug', 'help wanted'],
    } as any);
  });

  it('should correctly call GitHub API with only required parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      title: 'New Issue Title',
    });

    expect(mocks.issues.create).toHaveBeenCalled();

    // Check that only required parameters were passed
    const apiParams = mocks.issues.create.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      title: 'New Issue Title',
    } as any);
  });

  it('should return a JSON string with the created issue data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      title: 'New Issue Title',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.number).toBe(42);
    expect(parsedResult.title).toBe('Test Issue');
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

  it('should throw an error when title is empty', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        title: '', // Empty title
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.issues.create.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        title: 'New Issue Title',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
