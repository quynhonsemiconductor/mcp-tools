import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsGetWorkflowRunSchema,
  GithubActionsGetWorkflowRunTool,
} from './get-workflow-run-tool';

describe('GithubActionsGetWorkflowRunTool', () => {
  let tool: GithubActionsGetWorkflowRunTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.getWorkflowRun.mockReset();
    mocks.actions.getWorkflowRun.mockImplementation(async () => ({
      data: MOCK_DATA.workflowRun,
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsGetWorkflowRunTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsGetWorkflowRunSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsGetWorkflowRunSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('run_id');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    });

    expect(mocks.actions.getWorkflowRun).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    expect(mocks.actions.getWorkflowRun.mock.calls).toHaveLength(1);
    const apiParams = (mocks.actions.getWorkflowRun.mock.calls as any)[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    } as any);
  });

  it('should return a JSON string with the workflow run data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.id).toBe(MOCK_DATA.workflowRun.id);
    expect(parsedResult.name).toBe(MOCK_DATA.workflowRun.name);
    expect(parsedResult.status).toBe(MOCK_DATA.workflowRun.status);
    expect(parsedResult.conclusion).toBe(MOCK_DATA.workflowRun.conclusion);
    expect(parsedResult.workflow_id).toBe(MOCK_DATA.workflowRun.workflow_id);
  });

  it('should throw an error for invalid input', async () => {
    let error;
    try {
      // Missing required field run_id
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should validate that run_id is a number', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        run_id: 'abc' as any,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.actions.getWorkflowRun.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        run_id: 12345,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
