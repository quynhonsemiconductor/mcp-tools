import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubIssuesListSchema, GithubIssuesListTool } from './list-issues-tool';

describe('GithubIssuesListTool', () => {
  let tool: GithubIssuesListTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.issues.listForRepo.mockReset();
    mocks.issues.listForRepo.mockImplementation(async () => ({
      data: [MOCK_DATA.issue],
      headers: {
        link: '<https://api.github.com/repos/testorg/test-repo/issues?page=2>; rel="next"',
      },
    }));

    // Create a fresh instance for each test
    tool = new GithubIssuesListTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubIssuesListSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubIssuesListSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('state');
    expect(Object.keys(schemaShape)).toContain('labels');
    expect(Object.keys(schemaShape)).toContain('sort');
    expect(Object.keys(schemaShape)).toContain('direction');
    expect(Object.keys(schemaShape)).toContain('since');
    expect(Object.keys(schemaShape)).toContain('page');
    expect(Object.keys(schemaShape)).toContain('per_page');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      per_page: 30,
    });

    expect(mocks.issues.listForRepo).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.issues.listForRepo.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      per_page: 30,
    } as any);
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      state: 'open',
      labels: 'bug',
      sort: 'created',
      direction: 'desc',
      since: '2023-01-01T00:00:00Z',
      page: 2,
      per_page: 50,
    });

    expect(mocks.issues.listForRepo).toHaveBeenCalled();

    // Check that parameters were properly transformed
    const apiParams = mocks.issues.listForRepo.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      state: 'open',
      labels: 'bug',
      sort: 'created',
      direction: 'desc',
      since: '2023-01-01T00:00:00Z',
      page: 2,
      per_page: 50,
    } as any);
  });

  it('should return a JSON string with the issues data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      per_page: 10,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(Array.isArray(parsedResult.data)).toBe(true);
    expect(parsedResult.data.length).toBeGreaterThan(0);
    expect(parsedResult.data[0].number).toBe(42);
    expect(parsedResult.data[0].title).toBe('Test Issue');
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

  it('should throw an error for invalid state value', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
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
    mocks.issues.listForRepo.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
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
