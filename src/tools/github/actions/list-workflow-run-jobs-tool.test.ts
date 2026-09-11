import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsListWorkflowRunJobsSchema,
  GithubActionsListWorkflowRunJobsTool,
} from './list-workflow-run-jobs-tool';

describe('GithubActionsListWorkflowRunJobsTool', () => {
  let tool: GithubActionsListWorkflowRunJobsTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.listJobsForWorkflowRun.mockReset();
    mocks.actions.listJobsForWorkflowRun.mockImplementation(async () => ({
      data: {
        total_count: MOCK_DATA.workflowJobs.length,
        jobs: MOCK_DATA.workflowJobs,
      },
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsListWorkflowRunJobsTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsListWorkflowRunJobsSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsListWorkflowRunJobsSchema.shape;
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

    expect(mocks.actions.listJobsForWorkflowRun).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.listJobsForWorkflowRun.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    } as any);
  });

  it('should return a JSON string with the workflow jobs data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      run_id: 12345,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(parsedResult.data.total_count).toBe(MOCK_DATA.workflowJobs.length);
    expect(parsedResult.data.jobs).toHaveLength(MOCK_DATA.workflowJobs.length);
    expect(parsedResult.data.jobs[0].id).toBe(MOCK_DATA.workflowJobs[0].id);
    expect(parsedResult.data.jobs[0].name).toBe(MOCK_DATA.workflowJobs[0].name);
    expect(parsedResult.data.jobs[0].status).toBe(MOCK_DATA.workflowJobs[0].status);
    expect(parsedResult.data.jobs[0].steps).toHaveLength(MOCK_DATA.workflowJobs[0].steps.length);
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
    mocks.actions.listJobsForWorkflowRun.mockImplementation(() => {
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
