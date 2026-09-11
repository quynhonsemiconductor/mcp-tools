import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsRerunWorkflowSchema,
  GithubActionsRerunWorkflowTool,
} from './rerun-workflow-tool';

describe('GithubActionsRerunWorkflowTool', () => {
  let tool: GithubActionsRerunWorkflowTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.reRunWorkflow.mockReset();
    mocks.actions.reRunWorkflow.mockImplementation(async () => ({
      status: 201,
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsRerunWorkflowTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsRerunWorkflowSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsRerunWorkflowSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('run_id');
    expect(Object.keys(schemaShape)).toContain('enable_debug_logging');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    });

    expect(mocks.actions.reRunWorkflow).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.reRunWorkflow.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    } as any);
  });

  it('should include enable_debug_logging when provided', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
      enable_debug_logging: true,
    });

    expect(mocks.actions.reRunWorkflow).toHaveBeenCalled();

    // Check that all parameters were passed correctly
    const apiParams = mocks.actions.reRunWorkflow.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
      enable_debug_logging: true,
    } as any);
  });

  it('should return a JSON string with a success message', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).toBe(201);
    expect(parsedResult.message).toBe('Workflow run has been restarted.');
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
    mocks.actions.reRunWorkflow.mockImplementation(() => {
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
