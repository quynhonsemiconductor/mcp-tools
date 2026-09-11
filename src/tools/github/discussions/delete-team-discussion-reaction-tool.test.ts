import { beforeEach, describe, expect, test } from 'bun:test';
import { resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import {
  GithubDeleteTeamDiscussionReactionSchema,
  GithubDeleteTeamDiscussionReactionTool,
} from './delete-team-discussion-reaction-tool';

describe('GithubDeleteTeamDiscussionReactionTool', () => {
  let deleteReactionTool: GithubDeleteTeamDiscussionReactionTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    deleteReactionTool = new GithubDeleteTeamDiscussionReactionTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      reaction_id: 123,
    };

    expect(() => GithubDeleteTeamDiscussionReactionSchema.parse(params)).not.toThrow();
  });

  test('should correctly call GitHub API with required parameters', async () => {
    // Setup
    mocks.reactions.deleteForTeamDiscussion.mockResolvedValue({ status: 204 });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      reaction_id: 123,
    };

    // Execute
    const result = await deleteReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.deleteForTeamDiscussion).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      reaction_id: 123,
    });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Reaction deleted successfully');
  });

  test('should handle API errors gracefully', async () => {
    // Setup
    const apiError = new Error('API Error');
    mocks.reactions.deleteForTeamDiscussion.mockRejectedValue(apiError);

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      reaction_id: 123,
    };

    // Execute & Verify
    expect(deleteReactionTool.execute(params)).rejects.toThrow('API Error');
  });

  test('should handle non-204 response correctly', async () => {
    // Setup
    mocks.reactions.deleteForTeamDiscussion.mockResolvedValue({
      status: 200,
    });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      reaction_id: 123,
    };

    // Execute
    const result = await deleteReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.deleteForTeamDiscussion).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      reaction_id: 123,
    });
    expect(typeof result).toBe('string');
  });
});
