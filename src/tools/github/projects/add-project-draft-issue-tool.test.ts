import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  AddGithubProjectDraftIssueTool,
  AddGithubProjectDraftIssueToolParams,
  AddGithubProjectDraftIssueToolSchema,
} from './add-project-draft-issue-tool';

describe('AddGithubProjectDraftIssueTool', () => {
  let tool: AddGithubProjectDraftIssueTool;

  const validParams: AddGithubProjectDraftIssueToolParams = {
    project_id: 'PVT_kwDOTest123',
    title: 'New Draft Issue',
  };

  const mockResponse = {
    addProjectV2DraftIssue: {
      projectItem: {
        id: 'PVTI_kwDODraft789',
        type: 'DRAFT_ISSUE',
        content: {
          __typename: 'DraftIssue',
          title: 'New Draft Issue',
          body: null,
        },
      },
    },
  };

  beforeEach(() => {
    tool = new AddGithubProjectDraftIssueTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = AddGithubProjectDraftIssueToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts optional body parameter', () => {
      const result = AddGithubProjectDraftIssueToolSchema.safeParse({
        ...validParams,
        body: 'Some description',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = AddGithubProjectDraftIssueToolSchema.safeParse({
        title: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing title', () => {
      const result = AddGithubProjectDraftIssueToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the created draft issue', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.item.id).toBe('PVTI_kwDODraft789');
    expect(parsed.item.type).toBe('DRAFT_ISSUE');
    expect(parsed.item.content.type).toBe('DraftIssue');
    expect(parsed.item.content.title).toBe('New Draft Issue');
    expect(parsed.item.content.body).toBeNull();
  });

  it('calls GraphQL with correct variables including body', async () => {
    mocks.graphql.mockResolvedValue({
      addProjectV2DraftIssue: {
        projectItem: {
          id: 'PVTI_kwDODraft789',
          type: 'DRAFT_ISSUE',
          content: {
            __typename: 'DraftIssue',
            title: 'New Draft Issue',
            body: 'Some body content',
          },
        },
      },
    });

    await tool.execute({ ...validParams, body: 'Some body content' });

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('addProjectV2DraftIssue');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).title).toBe('New Draft Issue');
    expect((variables as any).body).toBe('Some body content');
  });

  it('passes undefined body when not provided', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).body).toBeUndefined();
  });

  it('handles null content gracefully', async () => {
    mocks.graphql.mockResolvedValue({
      addProjectV2DraftIssue: {
        projectItem: {
          id: 'PVTI_null',
          type: 'DRAFT_ISSUE',
          content: null,
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.item.content).toBeNull();
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ addProjectV2DraftIssue: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to create draft issue');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('Permission denied'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Permission denied');
  });
});
