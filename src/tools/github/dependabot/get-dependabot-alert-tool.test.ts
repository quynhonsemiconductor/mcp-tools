import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Set up specific mock for dependabot.getAlert
mocks.dependabot.getAlert.mockImplementation(async () => ({
  data: MOCK_DATA.dependabotAlert,
}));

// Import after mocking modules
import { GetDependabotAlertSchema, GetDependabotAlertTool } from './get-dependabot-alert-tool';

describe('GetDependabotAlertTool', () => {
  let tool: GetDependabotAlertTool;

  beforeEach(() => {
    // Reset all mocks before each test
    if (mocks.dependabot.getAlert) {
      mocks.dependabot.getAlert.mockReset();
      mocks.dependabot.getAlert.mockImplementation(async () => ({
        data: MOCK_DATA.dependabotAlert,
      }));
    }

    // Create a fresh instance for each test
    tool = new GetDependabotAlertTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GetDependabotAlertSchema).toBeDefined();

    // Verify schema by testing validation
    const validInput = {
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
    };

    // This should not throw
    expect(() => GetDependabotAlertSchema.parse(validInput)).not.toThrow();

    // Test required fields
    expect(() => GetDependabotAlertSchema.parse({})).toThrow();
    expect(() => GetDependabotAlertSchema.parse({ org: 'testorg', repo: 'test-repo' })).toThrow();
  });

  it('should correctly call GitHub API with required parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
    });

    expect(mocks.dependabot.getAlert).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.dependabot.getAlert.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
    });
  });

  it('should return a JSON string with the alert data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.number).toBe(1);
    expect(parsedResult.state).toBe('open');
    expect(parsedResult.dependency.package.name).toBe('lodash');
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

  it('should throw an error when alert_number is missing', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'test-repo',
      } as any);
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.dependabot.getAlert.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'test-repo',
        alert_number: 1,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
