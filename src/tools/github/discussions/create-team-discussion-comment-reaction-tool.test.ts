import { beforeEach, describe, expect, test } from 'bun:test';
import { MOCK_DATA, resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import {
  GithubCreateTeamDiscussionCommentReactionSchema,
  GithubCreateTeamDiscussionCommentReactionTool,
} from './create-team-discussion-comment-reaction-tool';

describe('GithubCreateTeamDiscussionCommentReactionTool', () => {
  let createReactionTool: GithubCreateTeamDiscussionCommentReactionTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    createReactionTool = new GithubCreateTeamDiscussionCommentReactionTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      content: '+1' as const,
    };

    expect(() => GithubCreateTeamDiscussionCommentReactionSchema.parse(params)).not.toThrow();
  });

  test('should validate reaction content', () => {
    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      content: 'invalid', // Invalid reaction type
    };

    expect(() => GithubCreateTeamDiscussionCommentReactionSchema.parse(params)).toThrow();
  });

  test('should correctly call GitHub API with required parameters', async () => {
    // Setup
    mocks.reactions.createForTeamDiscussionCommentInOrg.mockResolvedValue({
      data: MOCK_DATA.reaction,
    });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      content: '+1' as const,
    };

    // Execute
    const result = await createReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.createForTeamDiscussionCommentInOrg).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      content: '+1',
    });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed.id).toBe(1);
    expect(parsed.content).toBe('+1');
  });

  test('should handle API errors gracefully', async () => {
    // Setup
    const apiError = new Error('API Error');
    mocks.reactions.createForTeamDiscussionCommentInOrg.mockRejectedValue(apiError);

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      content: '+1' as const,
    };

    // Execute & Verify
    expect(createReactionTool.execute(params)).rejects.toThrow('API Error');
  });

  test('should support all valid reaction types', async () => {
    // Setup
    mocks.reactions.createForTeamDiscussionCommentInOrg.mockResolvedValue({
      data: { ...MOCK_DATA.reaction, content: 'heart' },
    });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      content: 'heart' as const,
    };

    // Execute
    const result = await createReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.createForTeamDiscussionCommentInOrg).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      comment_number: 2,
      content: 'heart',
    });
    const parsed = JSON.parse(result);
    expect(parsed.content).toBe('heart');
  });
});
