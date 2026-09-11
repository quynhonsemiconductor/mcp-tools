import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

// Import after mocking modules
import {
  GithubPullRequestMarkReadySchema,
  GithubPullRequestMarkReadyTool,
} from './mark-pull-request-ready-tool';

describe('GithubPullRequestMarkReadyTool', () => {
  let tool: GithubPullRequestMarkReadyTool;

  beforeEach(() => {
    mocks.pulls.get.mockReset();
    mocks.pulls.get.mockImplementation(async () => ({
      data: { number: 5, node_id: 'PR_node123', draft: true },
    }));
    mocks.graphql.mockReset();
    mocks.graphql.mockImplementation(async () => ({
      markPullRequestReadyForReview: {
        pullRequest: { number: 5, title: 'Test PR' },
      },
    }));

    tool = new GithubPullRequestMarkReadyTool();
  });

  it('should have the correct parameters schema', () => {
    expect(GithubPullRequestMarkReadySchema).toBeDefined();

    const schemaShape = GithubPullRequestMarkReadySchema.shape;
    expect(Object.keys(schemaShape)).toContain('org');
    expect(Object.keys(schemaShape)).toContain('repo');
    expect(Object.keys(schemaShape)).toContain('pull_number');
  });

  it('should fetch PR node_id and call GraphQL mutation', async () => {
    await tool.execute({
      org: 'testorg',
      repo: 'testrepo',
      pull_number: 5,
    });

    expect(mocks.pulls.get).toHaveBeenCalled();
    const getParams = mocks.pulls.get.mock.calls[0][0];
    expect(getParams).toEqual({
      owner: 'testorg',
      repo: 'testrepo',
      pull_number: 5,
    });

    expect(mocks.graphql).toHaveBeenCalled();
    const graphqlArgs = mocks.graphql.mock.calls[0];
    expect(graphqlArgs[0]).toContain('markPullRequestReadyForReview');
    expect(graphqlArgs[1]).toEqual({ pullRequestId: 'PR_node123' });
  });
});
