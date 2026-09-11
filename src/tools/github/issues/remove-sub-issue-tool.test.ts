import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubIssuesRemoveSubIssueSchema,
  GithubIssuesRemoveSubIssueTool,
} from './remove-sub-issue-tool';

describe('GithubIssuesRemoveSubIssueTool', () => {
  let tool: GithubIssuesRemoveSubIssueTool;

  beforeEach(() => {
    mocks.request.mockReset();
    mocks.request.mockImplementation(async () => ({
      data: MOCK_DATA.subIssue,
    }));

    tool = new GithubIssuesRemoveSubIssueTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesRemoveSubIssueSchema).toBeDefined();

    const schemaShape = GithubIssuesRemoveSubIssueSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('issue_number');
    expect(Object.keys(schemaShape)).toContain('sub_issue_id');
  });

  it('should call the correct GitHub API endpoint with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      sub_issue_id: 2460142,
    });

    expect(mocks.request).toHaveBeenCalledWith(
      'DELETE /repos/{owner}/{repo}/issues/{issue_number}/sub_issue',
      {
        owner: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        sub_issue_id: 2460142,
      },
    );
  });

  it('should return a JSON string response with issue fields', async () => {
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

  it('should return a success confirmation for 204 No Content response', async () => {
    mocks.request.mockImplementation(async () => ({
      status: 204,
      data: { id: 1, number: 43 },
    }));

    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      sub_issue_id: 2460142,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain('2460142');
    expect(parsed.message).toContain('31');
  });

  it('should return a success confirmation when response has no data body', async () => {
    mocks.request.mockImplementation(async () => ({
      status: 200,
      data: undefined,
    }));

    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      sub_issue_id: 2460142,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain('2460142');
    expect(parsed.message).toContain('31');
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
        issue_number: -1,
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
        sub_issue_id: 0,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
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
