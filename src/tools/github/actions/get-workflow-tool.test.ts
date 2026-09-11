import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import { GithubActionsGetWorkflowSchema, GithubActionsGetWorkflowTool } from './get-workflow-tool';

describe('GithubActionsGetWorkflowTool', () => {
  let tool: GithubActionsGetWorkflowTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.getWorkflow.mockReset();
    mocks.actions.getWorkflow.mockImplementation(async () => ({
      data: MOCK_DATA.workflow,
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsGetWorkflowTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsGetWorkflowSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsGetWorkflowSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('workflow_id');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
    });

    expect(mocks.actions.getWorkflow).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.getWorkflow.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
    } as any);
  });

  it('should return a JSON string with the workflow data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.id).toBe(MOCK_DATA.workflow.id);
    expect(parsedResult.name).toBe(MOCK_DATA.workflow.name);
    expect(parsedResult.path).toBe(MOCK_DATA.workflow.path);
    expect(parsedResult.state).toBe(MOCK_DATA.workflow.state);
  });

  it('should throw an error for invalid input', async () => {
    let error;
    try {
      // Missing required field workflow_id
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

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.actions.getWorkflow.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        workflow_id: 'ci.yml',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
