import { beforeEach, describe, expect, test } from 'bun:test';
import { resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import {
  GithubDeleteIssueCommentReactionSchema,
  GithubDeleteIssueCommentReactionTool,
} from './delete-issue-comment-reaction-tool';

describe('GithubDeleteIssueCommentReactionTool', () => {
  let deleteReactionTool: GithubDeleteIssueCommentReactionTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    deleteReactionTool = new GithubDeleteIssueCommentReactionTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      owner: 'testowner',
      repo: 'test-repo',
      comment_id: 101,
      reaction_id: 456,
    };

    expect(() => GithubDeleteIssueCommentReactionSchema.parse(params)).not.toThrow();
  });

  test('should correctly call GitHub API with required parameters', async () => {
    // Setup
    mocks.reactions.deleteForIssueComment.mockResolvedValue({ status: 204 });

    const params = {
      owner: 'testowner',
      repo: 'test-repo',
      comment_id: 101,
      reaction_id: 456,
    };

    // Execute
    const result = await deleteReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.deleteForIssueComment).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'test-repo',
      comment_id: 101,
      reaction_id: 456,
    });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Reaction deleted successfully');
  });

  test('should handle API errors gracefully', async () => {
    // Setup
    const apiError = new Error('API Error');
    mocks.reactions.deleteForIssueComment.mockRejectedValue(apiError);

    const params = {
      owner: 'testowner',
      repo: 'test-repo',
      comment_id: 101,
      reaction_id: 456,
    };

    // Execute & Verify
    expect(deleteReactionTool.execute(params)).rejects.toThrow('API Error');
  });

  test('should handle non-204 response correctly', async () => {
    // Setup
    mocks.reactions.deleteForIssueComment.mockResolvedValue({
      status: 200,
    });

    const params = {
      owner: 'testowner',
      repo: 'test-repo',
      comment_id: 101,
      reaction_id: 456,
    };

    // Execute
    const result = await deleteReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.deleteForIssueComment).toHaveBeenCalledWith({
      owner: 'testowner',
      repo: 'test-repo',
      comment_id: 101,
      reaction_id: 456,
    });
    expect(typeof result).toBe('string');
  });
});
