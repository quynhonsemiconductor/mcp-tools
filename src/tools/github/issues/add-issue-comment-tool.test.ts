import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubIssuesAddCommentSchema, GithubIssuesAddCommentTool } from './add-issue-comment-tool';

describe('GithubIssuesAddCommentTool', () => {
  let tool: GithubIssuesAddCommentTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.issues.createComment.mockReset();
    mocks.issues.createComment.mockImplementation(async () => ({
      data: MOCK_DATA.issueComment,
    }));

    // Create a fresh instance for each test
    tool = new GithubIssuesAddCommentTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesAddCommentSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubIssuesAddCommentSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('issue_number');
    expect(Object.keys(schemaShape)).toContain('body');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
      body: 'This is a test comment',
    });

    expect(mocks.issues.createComment).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.issues.createComment.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
      body: 'This is a test comment',
    } as any);
  });

  it('should return a JSON string with the created comment data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 42,
      body: 'This is a test comment',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.id).toBe(101);
    expect(parsedResult.body).toBe('This is a test comment');
    expect(parsedResult.user.login).toBe('testuser');
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
        body: 'This is a test comment',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error when body is empty', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 42,
        body: '', // Empty comment
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.issues.createComment.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 42,
        body: 'This is a test comment',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
