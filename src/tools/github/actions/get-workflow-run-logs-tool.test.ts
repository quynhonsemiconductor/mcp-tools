import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsGetWorkflowRunLogsSchema,
  GithubActionsGetWorkflowRunLogsTool,
} from './get-workflow-run-logs-tool';

describe('GithubActionsGetWorkflowRunLogsTool', () => {
  let tool: GithubActionsGetWorkflowRunLogsTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.downloadJobLogsForWorkflowRun.mockReset();
    mocks.actions.downloadJobLogsForWorkflowRun.mockImplementation(async () => ({
      data: 'Mock workflow job log content\nLine 2\nLine 3',
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsGetWorkflowRunLogsTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsGetWorkflowRunLogsSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsGetWorkflowRunLogsSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('job_id');
    expect(Object.keys(schemaShape)).toContain('attempt_number');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      job_id: 12345,
      attempt_number: 1,
    });

    expect(mocks.actions.downloadJobLogsForWorkflowRun).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.downloadJobLogsForWorkflowRun.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      job_id: 12345,
      attempt_number: 1,
    } as any);
  });

  it('should return the workflow job log content', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      job_id: 12345,
      attempt_number: 1,
    });

    expect(result).toBeDefined();
    expect(result).toContain('Mock workflow job log content');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
  });

  it('should throw an error for missing job_id', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        attempt_number: 1,
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for missing attempt_number', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        job_id: 12345,
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should validate that job_id is a positive number', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        job_id: -1,
        attempt_number: 1,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.actions.downloadJobLogsForWorkflowRun.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        job_id: 12345,
        attempt_number: 1,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
