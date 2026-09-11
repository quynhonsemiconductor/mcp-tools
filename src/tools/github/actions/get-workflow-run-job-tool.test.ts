import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsGetWorkflowRunJobSchema,
  GithubActionsGetWorkflowRunJobTool,
} from './get-workflow-run-job-tool';

describe('GithubActionsGetWorkflowRunJobTool', () => {
  let tool: GithubActionsGetWorkflowRunJobTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.getJobForWorkflowRun.mockReset();
    mocks.actions.getJobForWorkflowRun.mockImplementation(async () => ({
      data: MOCK_DATA.workflowJob,
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsGetWorkflowRunJobTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsGetWorkflowRunJobSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsGetWorkflowRunJobSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('job_id');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      job_id: 3456,
    });

    expect(mocks.actions.getJobForWorkflowRun).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.getJobForWorkflowRun.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      job_id: 3456,
    } as any);
  });

  it('should return a JSON string with the workflow job data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      job_id: 3456,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.id).toBe(MOCK_DATA.workflowJob.id);
    expect(parsedResult.name).toBe(MOCK_DATA.workflowJob.name);
    expect(parsedResult.status).toBe(MOCK_DATA.workflowJob.status);
    expect(parsedResult.run_id).toBe(MOCK_DATA.workflowJob.run_id);
    expect(parsedResult.steps).toHaveLength(MOCK_DATA.workflowJob.steps.length);
  });

  it('should throw an error for invalid input', async () => {
    let error;
    try {
      // Missing required field job_id
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

  it('should validate that job_id is a number', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        job_id: 'abc' as any,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.actions.getJobForWorkflowRun.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        job_id: 3456,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
