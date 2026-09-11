import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsListWorkflowsSchema,
  GithubActionsListWorkflowsTool,
} from './list-workflows-tool';

describe('GithubActionsListWorkflowsTool', () => {
  let tool: GithubActionsListWorkflowsTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.listRepoWorkflows.mockReset();
    mocks.actions.listRepoWorkflows.mockImplementation(async () => ({
      data: {
        total_count: MOCK_DATA.workflows.length,
        workflows: MOCK_DATA.workflows,
      },
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsListWorkflowsTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsListWorkflowsSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsListWorkflowsSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
    });

    expect(mocks.actions.listRepoWorkflows).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.listRepoWorkflows.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
    } as any);
  });

  it('should return a JSON string with the workflows data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(parsedResult.data.total_count).toBe(MOCK_DATA.workflows.length);
    expect(parsedResult.data.workflows).toHaveLength(MOCK_DATA.workflows.length);
    expect(parsedResult.data.workflows[0].id).toBe(MOCK_DATA.workflows[0].id);
    expect(parsedResult.data.workflows[0].name).toBe(MOCK_DATA.workflows[0].name);
    expect(parsedResult.data.workflows[0].path).toBe(MOCK_DATA.workflows[0].path);
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

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.actions.listRepoWorkflows.mockImplementation(() => {
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
