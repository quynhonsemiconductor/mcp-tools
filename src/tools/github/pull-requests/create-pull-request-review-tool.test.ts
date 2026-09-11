import { beforeEach, describe, expect, it } from 'bun:test';
import { MOCK_DATA, setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestCreateReviewSchema,
  GithubPullRequestCreateReviewTool,
} from './create-pull-request-review-tool';

describe('GithubPullRequestCreateReviewTool', () => {
  let tool: GithubPullRequestCreateReviewTool;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks.pulls.createReview.mockReset();
    mocks.pulls.createReview.mockImplementation(async () => ({
      data: MOCK_DATA.pullRequestReviews[0],
    }));

    // Create a fresh instance for each test
    tool = new GithubPullRequestCreateReviewTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestCreateReviewSchema).toBeDefined();

    // Validate schema keys
    const schemaShape = GithubPullRequestCreateReviewSchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
    expect(Object.keys(schemaShape)).toContain('event');
    expect(Object.keys(schemaShape)).toContain('body');
    expect(Object.keys(schemaShape)).toContain('commit_id');
    expect(Object.keys(schemaShape)).toContain('comments');
  });

  it('should correctly call GitHub API with minimal parameters', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      event: 'APPROVE',
    });

    expect(mocks.pulls.createReview).toHaveBeenCalled();

    // Check that parameters were properly transformed (org to owner)
    const apiParams = mocks.pulls.createReview.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      event: 'APPROVE',
    } as any);
  });

  it('should correctly call GitHub API with body parameter', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      event: 'COMMENT',
      body: 'This looks great!',
    });

    expect(mocks.pulls.createReview).toHaveBeenCalled();

    const apiParams = mocks.pulls.createReview.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      event: 'COMMENT',
      body: 'This looks great!',
    } as any);
  });

  it('should correctly call GitHub API with inline comments', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      event: 'REQUEST_CHANGES',
      body: 'Please address these comments',
      comments: [
        {
          path: 'src/index.js',
          position: 5,
          body: 'Consider using const here instead of let',
        },
        {
          path: 'README.md',
          position: 10,
          body: 'This section needs more details',
        },
      ],
    });

    expect(mocks.pulls.createReview).toHaveBeenCalled();

    const apiParams = mocks.pulls.createReview.mock.calls[0][0];
    expect(apiParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      event: 'REQUEST_CHANGES',
      body: 'Please address these comments',
      comments: [
        {
          path: 'src/index.js',
          position: 5,
          body: 'Consider using const here instead of let',
        },
        {
          path: 'README.md',
          position: 10,
          body: 'This section needs more details',
        },
      ],
    } as any);
  });

  it('should return a JSON string with the created review data', async () => {
    const result = await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 27,
      event: 'APPROVE',
      body: 'Approved!',
    });

    expect(result).toBeDefined();
    const parsedResult = JSON.parse(result);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.id).toBe(301);
    expect(parsedResult.state).toBe('APPROVED');
    expect(parsedResult.user.login).toBe('reviewer1');
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

  it('should throw an error when pull_number is not a positive integer', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: -5, // Negative number
        event: 'APPROVE',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should throw an error for invalid event value', async () => {
    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: 27,
        event: 'INVALID' as any,
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
  });

  it('should handle API errors gracefully', async () => {
    // Mock the API call to throw an error
    mocks.pulls.createReview.mockImplementation(() => {
      throw new Error('API error');
    });

    let error;
    try {
      await tool.execute({
        org: 'testorg',
        repo: 'testrepo',
        pull_number: 27,
        event: 'APPROVE',
      });
    } catch (e: any) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Tool execution error');
    expect(error.message).toContain('API error');
  });
});
