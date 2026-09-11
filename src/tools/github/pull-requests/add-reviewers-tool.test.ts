import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestAddReviewersSchema,
  GithubPullRequestAddReviewersTool,
} from './add-reviewers-tool';

describe('GithubPullRequestAddReviewersTool', () => {
  let tool: GithubPullRequestAddReviewersTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.requestReviewers.mockReset();
    mocks.pulls.requestReviewers.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequest,
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestAddReviewersTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestAddReviewersSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestAddReviewersSchema.shape;
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

    expect(mocks.pulls.requestReviewers).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const mockCalls = mocks.pulls.requestReviewers.mock.calls as any[][];
    expect(mockCalls.length).toBeGreaterThan(0);
    const apiParams = mockCalls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      reviewers: ['George-Thompson', 'john-doe'],
    } as any);
  });

  it('should correctly call GitHub API with team reviewers', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      team_reviewers: ['team-alpha', 'team-beta'],
    });

    expect(mocks.pulls.requestReviewers).toHaveBeenCalled();

    // Check that parameters were properly transformed
    const mockCalls = mocks.pulls.requestReviewers.mock.calls as any[][];
    expect(mockCalls.length).toBeGreaterThan(0);
    const apiParams = mockCalls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      team_reviewers: ['team-alpha', 'team-beta'],
    } as any);
  });

  it('should correctly call GitHub API with both individual and team reviewers', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      reviewers: ['George-Thompson'],
      team_reviewers: ['team-alpha'],
    });

    expect(mocks.pulls.requestReviewers).toHaveBeenCalled();

    // Check that parameters were properly transformed
    const mockCalls = mocks.pulls.requestReviewers.mock.calls as any[][];
    expect(mockCalls.length).toBeGreaterThan(0);
    const apiParams = mockCalls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      reviewers: ['George-Thompson'],
      team_reviewers: ['team-alpha'],
    } as any);
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
