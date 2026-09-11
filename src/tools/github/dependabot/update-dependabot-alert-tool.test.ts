import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Set up specific mock for dependabot.updateAlert
mocks.dependabot.updateAlert.mockImplementation(async () => ({
  data: MOCK_DATA.dependabotAlert,
}));

// Import after mocking modules
import {
  UpdateDependabotAlertSchema,
  UpdateDependabotAlertTool,
} from './update-dependabot-alert-tool';

describe('UpdateDependabotAlertTool', () => {
  let tool: UpdateDependabotAlertTool;

  beforeEach(() => {
    // Reset all mocks before each test
    if (mocks.dependabot.updateAlert) {
      mocks.dependabot.updateAlert.mockReset();
      mocks.dependabot.updateAlert.mockImplementation(async () => ({
        data: MOCK_DATA.dependabotAlert,
      }));
    }

    // Create a fresh instance for each test
    tool = new UpdateDependabotAlertTool();
  });

  it('should have the correct parameters schema', () => {
    expect(UpdateDependabotAlertSchema).toBeDefined();

    // Verify schema by testing validation
    const validInput = {
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
      state: 'open',
    };

    const validDismissInput = {
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
      state: 'dismissed',
      dismissed_reason: 'fix_started',
    };

    // These should not throw
    expect(() => UpdateDependabotAlertSchema.parse(validInput)).not.toThrow();
    expect(() => UpdateDependabotAlertSchema.parse(validDismissInput)).not.toThrow();

    // Test required fields
    expect(() => UpdateDependabotAlertSchema.parse({})).toThrow();
    expect(() =>
      UpdateDependabotAlertSchema.parse({
        org: 'testorg',
        repo: 'test-repo',
        alert_number: 1,
      }),
    ).toThrow();

    // Test dismissed state requires dismissed_reason
    expect(() =>
      UpdateDependabotAlertSchema.parse({
        org: 'testorg',
        repo: 'test-repo',
        alert_number: 1,
        state: 'dismissed',
      }),
    ).toThrow();
  });

  it('should correctly call GitHub API to open an alert', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
      state: 'open',
    });

    expect(mocks.dependabot.updateAlert).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.dependabot.updateAlert.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
      state: 'open',
    });
  });

  it('should correctly call GitHub API to dismiss an alert', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
      state: 'dismissed',
      dismissed_reason: 'fix_started',
      dismissed_comment: 'Working on fix',
    });

    expect(mocks.dependabot.updateAlert).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.dependabot.updateAlert.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
      state: 'dismissed',
      dismissed_reason: 'fix_started',
      dismissed_comment: 'Working on fix',
    });
  });

  it('should return a JSON string with the updated alert data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
      alert_number: 1,
      state: 'open',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.number).toBe(1);
    expect(parsedResult.state).toBe('open');
    expect(parsedResult.dependency.package.name).toBe('lodash');
  });

  it('should throw an error when dismissed_reason is not provided for dismissed state', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'test-repo',
        alert_number: 1,
        state: 'dismissed', // Missing dismissed_reason
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
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

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.dependabot.updateAlert.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'test-repo',
        alert_number: 1,
        state: 'open',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
