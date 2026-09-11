import { beforeEach, describe, expect, test } from 'bun:test';
import { MOCK_DATA, resetGitHubMocks, setupGitHubMocks } from '../__test__/test-utils';
import {
  GithubCreateTeamDiscussionReactionSchema,
  GithubCreateTeamDiscussionReactionTool,
} from './create-team-discussion-reaction-tool';

describe('GithubCreateTeamDiscussionReactionTool', () => {
  let createReactionTool: GithubCreateTeamDiscussionReactionTool;
  let mocks: ReturnType<typeof setupGitHubMocks>;

  beforeEach(() => {
    mocks = setupGitHubMocks();
    resetGitHubMocks(mocks);
    createReactionTool = new GithubCreateTeamDiscussionReactionTool();
  });

  test('should have the correct parameters schema', () => {
    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      content: '+1' as const,
    };

    expect(() => GithubCreateTeamDiscussionReactionSchema.parse(params)).not.toThrow();
  });

  test('should validate reaction content', () => {
    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      content: 'invalid', // Invalid reaction type
    };

    expect(() => GithubCreateTeamDiscussionReactionSchema.parse(params)).toThrow();
  });

  test('should correctly call GitHub API with required parameters', async () => {
    // Setup
    mocks.reactions.createForTeamDiscussionInOrg.mockResolvedValue({
      data: MOCK_DATA.reaction,
    });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      content: '+1' as const,
    };

    // Execute
    const result = await createReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.createForTeamDiscussionInOrg).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
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
    mocks.reactions.createForTeamDiscussionInOrg.mockRejectedValue(apiError);

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      content: '+1' as const,
    };

    // Execute & Verify
    expect(createReactionTool.execute(params)).rejects.toThrow('API Error');
  });

  test('should support all valid reaction types', async () => {
    // Setup
    mocks.reactions.createForTeamDiscussionInOrg.mockResolvedValue({
      data: { ...MOCK_DATA.reaction, content: 'heart' },
    });

    const params = {
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      content: 'heart' as const,
    };

    // Execute
    const result = await createReactionTool.execute(params);

    // Verify
    expect(mocks.reactions.createForTeamDiscussionInOrg).toHaveBeenCalledWith({
      org: 'testorg',
      team_slug: 'engineering',
      discussion_number: 1,
      content: 'heart',
    });
    const parsed = JSON.parse(result);
    expect(parsed.content).toBe('heart');
  });
});
