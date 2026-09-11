import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubIssuesListSubIssuesSchema,
  GithubIssuesListSubIssuesTool,
} from './list-sub-issues-tool';

describe('GithubIssuesListSubIssuesTool', () => {
  let tool: GithubIssuesListSubIssuesTool;

  beforeEach(() => {
    mocks.request.mockReset();
    mocks.request.mockImplementation(async () => ({
      data: MOCK_DATA.subIssues,
    }));

    tool = new GithubIssuesListSubIssuesTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesListSubIssuesSchema).toBeDefined();

    const schemaShape = GithubIssuesListSubIssuesSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('issue_number');
    expect(Object.keys(schemaShape)).toContain('per_page');
    expect(Object.keys(schemaShape)).toContain('page');
  });

  it('should call the correct GitHub API endpoint with required parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
    });

    expect(mocks.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
      expect.objectContaining({
        owner: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        per_page: 30,
      }),
    );
  });

  it('should pass pagination parameters when provided', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      per_page: 50,
      page: 2,
    });

    expect(mocks.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues',
      expect.objectContaining({
        owner: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        per_page: 50,
        page: 2,
      }),
    );
  });

  it('should return a paginated envelope with an array of sub-issues', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
    });

    expect(result).toBeDefined();
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].number).toBe(43);
    expect(parsed.data[1].number).toBe(44);
    expect(parsed.pagination).toBeDefined();
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

  it('should throw an error when per_page exceeds 100', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        per_page: 101,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error when page is less than 1', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        issue_number: 31,
        page: 0,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should parse Link header and populate pagination fields', async () => {
    mocks.request.mockImplementation(async () => ({
      data: MOCK_DATA.subIssues,
      headers: {
        link: '<https://api.github.com/repos/testorg/testrepo/issues/31/sub_issues?page=3>; rel="next", <https://api.github.com/repos/testorg/testrepo/issues/31/sub_issues?page=1>; rel="prev", <https://api.github.com/repos/testorg/testrepo/issues/31/sub_issues?page=5>; rel="last"',
      },
    }));

    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      issue_number: 31,
      page: 2,
    });

    const parsed = JSON.parse(result);
    expect(parsed.pagination.hasNext).toBe(true);
    expect(parsed.pagination.hasPrevious).toBe(true);
    expect(parsed.pagination.totalPages).toBe(5);
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
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
