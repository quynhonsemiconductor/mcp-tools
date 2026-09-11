import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Set up specific mock for dependabot.listAlertsForRepo
mocks.dependabot.listAlertsForRepo.mockImplementation(async () => ({
  data: MOCK_DATA.dependabotAlerts,
  headers: {
    link: '<https://api.github.com/repos/testorg/test-repo/dependabot/alerts?page=2>; rel="next"',
  },
}));

// Import after mocking modules
import {
  ListDependabotAlertsSchema,
  ListDependabotAlertsTool,
} from './list-dependabot-alerts-tool';

describe('ListDependabotAlertsTool', () => {
  let tool: ListDependabotAlertsTool;

  beforeEach(() => {
    // Reset all mocks before each test
    if (mocks.dependabot.listAlertsForRepo) {
      mocks.dependabot.listAlertsForRepo.mockReset();
      mocks.dependabot.listAlertsForRepo.mockImplementation(async () => ({
        data: MOCK_DATA.dependabotAlerts,
        headers: {
          link: '<https://api.github.com/repos/testorg/test-repo/dependabot/alerts?page=2>; rel="next"',
        },
      }));
    }

    // Create a fresh instance for each test
    tool = new ListDependabotAlertsTool();
  });

  it('should have the correct parameters schema', () => {
    expect(ListDependabotAlertsSchema).toBeDefined();

    // Verify schema by testing validation
    const validInput = {
      org: 'testorg',
      repo: 'test-repo',
      state: 'open',
      severity: 'high',
      ecosystem: 'npm',
      per_page: 10,
      page: 1,
    };

    // This should not throw
    expect(() => ListDependabotAlertsSchema.parse(validInput)).not.toThrow();

    // Test required fields
    expect(() => ListDependabotAlertsSchema.parse({})).toThrow();
    expect(() => ListDependabotAlertsSchema.parse({ org: 'testorg' })).toThrow();
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
    });

    expect(mocks.dependabot.listAlertsForRepo).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.dependabot.listAlertsForRepo.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'test-repo',
      per_page: 10,
    });
  });

  it('should correctly call GitHub API with all optional parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
      state: 'open',
      severity: 'high',
      ecosystem: 'npm',
      package: 'lodash',
      manifest: 'package.json',
      epss_percentage: '>0.5',
      scope: 'runtime',
      per_page: 30,
    });

    expect(mocks.dependabot.listAlertsForRepo).toHaveBeenCalled();

    // Check that parameters were properly set
    const apiParams = mocks.dependabot.listAlertsForRepo.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'test-repo',
      state: 'open',
      severity: 'high',
      ecosystem: 'npm',
      package: 'lodash',
      manifest: 'package.json',
      epss_percentage: '>0.5',
      scope: 'runtime',
      per_page: 30,
    });
  });

  it('should return a JSON string with the alerts data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'test-repo',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult.data).toBeDefined();
    expect(Array.isArray(parsedResult.data)).toBe(true);
    expect(parsedResult.data.length).toBe(2);
    expect(parsedResult.data[0].number).toBe(1);
    expect(parsedResult.data[1].number).toBe(2);
    expect(parsedResult.data[0].state).toBe('open');
    expect(parsedResult.data[1].state).toBe('dismissed');
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
    mocks.dependabot.listAlertsForRepo.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'test-repo',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });

  it('never sends a page parameter, which this endpoint rejects', async () => {
    // GitHub answers "Pagination using the `page` parameter is not supported" for
    // Dependabot alerts, so passing it made every call fail. It pages by cursor.
    const tool = new ListDependabotAlertsTool();
    await tool.execute({ org: 'testorg', repo: 'test-repo' });

    const apiParams = mocks.dependabot.listAlertsForRepo.mock.calls[0][0];
    expect(apiParams).not.toHaveProperty('page');
  });
});
