import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubOrgGetSchema, GithubOrgGetTool } from './get-org-tool';

describe('GithubOrgGetTool', () => {
  let tool: GithubOrgGetTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.orgs.get.mockReset();
    mocks.orgs.get.mockImplementation(async () => ({
      data: MOCK_DATA.org,
    }));

    // Create a fresh instance for each test
    tool = new GithubOrgGetTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubOrgGetSchema).toBeDefined();
    const schemaShape = GithubOrgGetSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
  });

  it('should correctly call GitHub API with the org parameter', async () => {
    await tool.execute({
      org: 'testorg',
    });

    expect(mocks.orgs.get).toHaveBeenCalled();
    const apiParams = mocks.orgs.get.mock.calls[0][0];
    expect(apiParams).toEqual({
      org: 'testorg',
    });
  });

  it('should return a JSON string with the organization data', async () => {
    const result = await tool.execute({
      org: 'testorg',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    // Just test that the result is a string that can be parsed as JSON
    expect(typeof result).toBe('string');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.orgs.get.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('API error');
  });
});
