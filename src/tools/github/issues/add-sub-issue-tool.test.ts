import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubIssuesAddSubIssueSchema, GithubIssuesAddSubIssueTool } from './add-sub-issue-tool';

describe('GithubIssuesAddSubIssueTool', () => {
  let tool: GithubIssuesAddSubIssueTool;

  beforeEach(() => {
    mocks.request.mockReset();
    mocks.request.mockImplementation(async () => ({
      data: MOCK_DATA.subIssue,
    }));

    tool = new GithubIssuesAddSubIssueTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesAddSubIssueSchema).toBeDefined();

    const schemaShape = GithubIssuesAddSubIssueSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('issue_number');
    expect(Object.keys(schemaShape)).toContain('sub_issue_id');
    expect(Object.keys(schemaShape)).toContain('replace_parent');
  });

  it('should call the correct GitHub API endpoint with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      sub_issue_id: 2460142,
    });

    expect(mocks.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
      expect.objectContaining({
        owner: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        sub_issue_id: 2460142,
      }),
    );
    const callArgs = mocks.request.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty('replace_parent');
  });

  it('should return a JSON string with the sub-issue data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      sub_issue_id: 2460142,
    });

    expect(result).toBeDefined();
    const parsed = JSON.parse(result);
    expect(parsed.number).toBe(43);
    expect(parsed.title).toBe('Sub Issue');
    expect(parsed.state).toBe('open');
  });

  it('should throw an error for missing required fields', async () => {
    let error;
    try {
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
        issue_number: 0,
        sub_issue_id: 2460142,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error when sub_issue_id is not a positive integer', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        sub_issue_id: -1,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should pass replace_parent: true when provided', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      sub_issue_id: 2460142,
      replace_parent: true,
    });

    expect(mocks.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
      expect.objectContaining({
        replace_parent: true,
      }),
    );
  });

  it('should forward replace_parent: false when explicitly provided', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      sub_issue_id: 2460142,
      replace_parent: false,
    });

    expect(mocks.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
      expect.objectContaining({
        replace_parent: false,
      }),
    );
  });

  it('should throw a helpful error when the sub-issue already has a parent', async () => {
    mocks.request.mockImplementation(() => {
      const error: any = new Error('Sub-issue already has a parent issue');
      error.status = 422;
      throw error;
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        sub_issue_id: 2460142,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('replace_parent');
  });

  it('should re-throw a 422 error that is not about a parent relationship', async () => {
    mocks.request.mockImplementation(() => {
      const error: any = new Error('Validation failed: issue is locked');
      error.status = 422;
      throw error;
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        sub_issue_id: 2460142,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).not.toContain('replace_parent');
    expect(error.message).toContain('Validation failed: issue is locked');
  });

  it('should re-throw a 422 error whose message contains "parent" but not the specific GitHub string', async () => {
    mocks.request.mockImplementation(() => {
      const error: any = new Error('parent project is archived');
      error.status = 422;
      throw error;
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        sub_issue_id: 2460142,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).not.toContain('replace_parent');
  });

  it('should handle API errors gracefully', async () => {
    mocks.request.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        sub_issue_id: 2460142,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
