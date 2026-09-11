import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestRemoveReviewersSchema,
  GithubPullRequestRemoveReviewersTool,
} from './remove-reviewers-tool';

describe('GithubPullRequestRemoveReviewersTool', () => {
  let tool: GithubPullRequestRemoveReviewersTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.removeRequestedReviewers.mockReset();
    mocks.pulls.removeRequestedReviewers.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequest,
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestRemoveReviewersTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestRemoveReviewersSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestRemoveReviewersSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
    expect(Object.keys(schemaShape)).toContain('reviewers');
    expect(Object.keys(schemaShape)).toContain('team_reviewers');
  });

  it('should correctly call GitHub API with individual reviewers', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      reviewers: ['George-Thompson', 'john-doe'],
    });

    expect(mocks.pulls.removeRequestedReviewers).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const mockCalls = mocks.pulls.removeRequestedReviewers.mock.calls as any[][];
    expect(mockCalls.length).toBeGreaterThan(0);
    const apiParams = mockCalls[0][0];
    expect(apiParams.owner).toBe('testorg');
    expect(apiParams.repo).toBe('testrepo');
    expect(apiParams.pull_number).toBe(27);
    expect(apiParams.reviewers).toEqual(['George-Thompson', 'john-doe']);
  });

  it('should correctly call GitHub API with team reviewers', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      team_reviewers: ['team-alpha', 'team-beta'],
    });

    expect(mocks.pulls.removeRequestedReviewers).toHaveBeenCalled();

    // Check that parameters were properly transformed
    const mockCalls = mocks.pulls.removeRequestedReviewers.mock.calls as any[][];
    expect(mockCalls.length).toBeGreaterThan(0);
    const apiParams = mockCalls[0][0];
    expect(apiParams.owner).toBe('testorg');
    expect(apiParams.repo).toBe('testrepo');
    expect(apiParams.pull_number).toBe(27);
    expect(apiParams.team_reviewers).toEqual(['team-alpha', 'team-beta']);
  });

  it('should correctly call GitHub API with both individual and team reviewers', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      reviewers: ['George-Thompson'],
      team_reviewers: ['team-alpha'],
    });

    expect(mocks.pulls.removeRequestedReviewers).toHaveBeenCalled();

    // Check that parameters were properly transformed
    const mockCalls = mocks.pulls.removeRequestedReviewers.mock.calls as any[][];
    expect(mockCalls.length).toBeGreaterThan(0);
    const apiParams = mockCalls[0][0];
    expect(apiParams.owner).toBe('testorg');
    expect(apiParams.repo).toBe('testrepo');
    expect(apiParams.pull_number).toBe(27);
    expect(apiParams.reviewers).toEqual(['George-Thompson']);
    expect(apiParams.team_reviewers).toEqual(['team-alpha']);
  });

  it('should throw error when no reviewers are specified', async () => {
    expect(async () => {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: 27,
      });
    }).toThrow('At least one reviewer or team reviewer must be specified');
  });

  it('should return cleaned response', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      reviewers: ['George-Thompson'],
    });

    expect(typeof result).toBe('string');
    expect(result).toContain('"id"');
    expect(result).toContain('"number"');
  });
});
