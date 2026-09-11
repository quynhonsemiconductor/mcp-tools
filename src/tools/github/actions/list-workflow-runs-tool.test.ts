import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsListWorkflowRunsSchema,
  GithubActionsListWorkflowRunsTool,
} from './list-workflow-runs-tool';

describe('GithubActionsListWorkflowRunsTool', () => {
  let tool: GithubActionsListWorkflowRunsTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.listWorkflowRuns.mockReset();
    mocks.actions.listWorkflowRuns.mockImplementation(async () => ({
      data: {
        total_count: MOCK_DATA.workflowRuns.length,
        workflow_runs: MOCK_DATA.workflowRuns,
      },
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsListWorkflowRunsTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsListWorkflowRunsSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsListWorkflowRunsSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('branch');
    expect(Object.keys(schemaShape)).toContain('status');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      workflow_id: 'main.yaml',
    });

    expect(mocks.actions.listWorkflowRuns).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.listWorkflowRuns.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      workflow_id: 'main.yaml',
    } as any);
  });

  it('should include optional parameters when provided', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      branch: 'feature-branch',
      status: 'completed',
      workflow_id: 'main.yaml',
    });

    expect(mocks.actions.listWorkflowRuns).toHaveBeenCalled();

    // Check that all parameters were passed correctly
    const apiParams = mocks.actions.listWorkflowRuns.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      branch: 'feature-branch',
      status: 'completed',
      workflow_id: 'main.yaml',
    } as any);
  });

  it('should return a JSON string with the workflow runs data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      workflow_id: 'main.yaml',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(parsedResult.data.total_count).toBe(MOCK_DATA.workflowRuns.length);
    expect(parsedResult.data.workflow_runs).toHaveLength(MOCK_DATA.workflowRuns.length);
    expect(parsedResult.data.workflow_runs[0].id).toBe(MOCK_DATA.workflowRuns[0].id);
    expect(parsedResult.data.workflow_runs[0].name).toBe(MOCK_DATA.workflowRuns[0].name);
    expect(parsedResult.data.workflow_runs[0].status).toBe(MOCK_DATA.workflowRuns[0].status);
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

  it('should throw an error for invalid status value', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        status: 'invalid-status' as any,
        workflow_id: 'main.yaml',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.actions.listWorkflowRuns.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        workflow_id: 'main.yaml',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
