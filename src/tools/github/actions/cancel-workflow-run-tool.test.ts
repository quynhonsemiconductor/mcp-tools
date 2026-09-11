import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsCancelWorkflowRunSchema,
  GithubActionsCancelWorkflowRunTool,
} from './cancel-workflow-run-tool';

describe('GithubActionsCancelWorkflowRunTool', () => {
  let tool: GithubActionsCancelWorkflowRunTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.cancelWorkflowRun.mockReset();
    mocks.actions.cancelWorkflowRun.mockImplementation(async () => ({
      status: 202,
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsCancelWorkflowRunTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsCancelWorkflowRunSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsCancelWorkflowRunSchema.shape;
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

    expect(mocks.actions.cancelWorkflowRun).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.cancelWorkflowRun.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
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
    expect(parsedResult.status).toBe(202);
    expect(parsedResult.message).toBe('Workflow run cancellation request has been accepted.');
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
    mocks.actions.cancelWorkflowRun.mockImplementation(() => {
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
