import { beforeEach, describe, expect, test } from 'bun:test';
import { resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import {
  GithubDeleteTeamDiscussionCommentReactionSchema,
  GithubDeleteTeamDiscussionCommentReactionTool,
} from './delete-team-discussion-comment-reaction-tool';

describe('GithubDeleteTeamDiscussionCommentReactionTool', () => {
  let deleteReactionTool: GithubDeleteTeamDiscussionCommentReactionTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    deleteReactionTool = new GithubDeleteTeamDiscussionCommentReactionTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      reaction_id: 123,
    };

    expect(() => GithubDeleteTeamDiscussionCommentReactionSchema.parse(params)).not.toThrow();
  });

  test('should correctly call GitHub API with required parameters', async () => {
    // Setup
    mocks.reactions.deleteForTeamDiscussionComment.mockResolvedValue({
      status: 204,
    });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      reaction_id: 123,
    };

    // Execute
    const result = await deleteReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.deleteForTeamDiscussionComment).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
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
    mocks.reactions.deleteForTeamDiscussionComment.mockRejectedValue(apiError);

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      reaction_id: 123,
    };

    // Execute & Verify
    expect(deleteReactionTool.execute(params)).rejects.toThrow('API Error');
  });

  test('should handle non-204 response correctly', async () => {
    // Setup
    mocks.reactions.deleteForTeamDiscussionComment.mockResolvedValue({
      status: 200,
    });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      reaction_id: 123,
    };

    // Execute
    const result = await deleteReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.deleteForTeamDiscussionComment).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      reaction_id: 123,
    });
    expect(typeof result).toBe('string');
  });
});
