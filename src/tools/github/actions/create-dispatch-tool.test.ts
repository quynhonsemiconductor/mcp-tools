import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubActionsCreateDispatchSchema,
  GithubActionsCreateDispatchTool,
} from './create-dispatch-tool';

describe('GithubActionsCreateDispatchTool', () => {
  let tool: GithubActionsCreateDispatchTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.actions.createWorkflowDispatch.mockReset();
    mocks.actions.createWorkflowDispatch.mockImplementation(async () => ({
      status: 204,
      data: { message: 'Workflow dispatch event created.' },
    }));

    // Create a fresh instance for each test
    tool = new GithubActionsCreateDispatchTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubActionsCreateDispatchSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubActionsCreateDispatchSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('workflow_id');
    expect(Object.keys(schemaShape)).toContain('ref');
    expect(Object.keys(schemaShape)).toContain('inputs');
  });

  it('should correctly call GitHub API with transformed parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
      ref: 'feature-branch',
      inputs: { test: 'value' },
    });

    expect(mocks.actions.createWorkflowDispatch).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.actions.createWorkflowDispatch.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
      ref: 'feature-branch',
      inputs: { test: 'value' },
    } as any);
  });

  it('should use default ref value if not provided', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
    });

    expect(mocks.actions.createWorkflowDispatch).toHaveBeenCalled();

    // Check that parameters were properly transformed and default ref was added
    const apiParams = mocks.actions.createWorkflowDispatch.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
      ref: 'main',
    } as any);
  });

  it('should return a JSON string with a success message', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      workflow_id: 'ci.yml',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.status).toBe(204);
    expect(parsedResult.message).toBe('Workflow dispatch created successfully.');
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
    mocks.actions.createWorkflowDispatch.mockImplementation(() => {
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
