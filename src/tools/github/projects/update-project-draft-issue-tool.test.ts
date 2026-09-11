import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  UpdateGithubProjectDraftIssueTool,
  UpdateGithubProjectDraftIssueToolParams,
  UpdateGithubProjectDraftIssueToolSchema,
} from './update-project-draft-issue-tool';

describe('UpdateGithubProjectDraftIssueTool', () => {
  let tool: UpdateGithubProjectDraftIssueTool;

  const validParams: UpdateGithubProjectDraftIssueToolParams = {
    project_id: 'PVT_kwDOTest123',
    item_id: 'PVTI_kwDODraft456',
    title: 'Updated Title',
  };

  const mockResolveResponse = {
    node: {
      content: {
        id: 'DI_resolved_789',
      },
    },
  };

  const mockUpdateResponse = {
    updateProjectV2DraftIssue: {
      draftIssue: {
        id: 'DI_resolved_789',
        title: 'Updated Title',
        body: null,
      },
    },
  };

  beforeEach(() => {
    tool = new UpdateGithubProjectDraftIssueTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = UpdateGithubProjectDraftIssueToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts valid parameters with optional body', () => {
      const result = UpdateGithubProjectDraftIssueToolSchema.safeParse({
        ...validParams,
        body: 'Updated body content',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = UpdateGithubProjectDraftIssueToolSchema.safeParse({
        item_id: 'PVTI_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing item_id', () => {
      const result = UpdateGithubProjectDraftIssueToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('resolves item ID to draft issue ID and updates', async () => {
    mocks.graphql
      .mockResolvedValueOnce(mockResolveResponse)
      .mockResolvedValueOnce(mockUpdateResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.draftIssue.id).toBe('DI_resolved_789');
    expect(parsed.draftIssue.title).toBe('Updated Title');
  });

  it('calls resolve query with item ID then mutation with draft issue ID', async () => {
    mocks.graphql
      .mockResolvedValueOnce(mockResolveResponse)
      .mockResolvedValueOnce(mockUpdateResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalledTimes(2);

    // First call: resolve item ID to draft issue ID
    const [resolveQuery, resolveVars] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(resolveQuery)).toContain('ResolveDraftIssueId');
    expect((resolveVars as any).itemId).toBe('PVTI_kwDODraft456');

    // Second call: mutation with resolved draft issue ID
    const [mutationQuery, mutationVars] = mocks.graphql.mock.calls[1] as unknown[];
    expect(String(mutationQuery)).toContain('updateProjectV2DraftIssue');
    expect((mutationVars as any).draftIssueId).toBe('DI_resolved_789');
    expect((mutationVars as any).title).toBe('Updated Title');
  });

  it('passes body when provided', async () => {
    mocks.graphql.mockResolvedValueOnce(mockResolveResponse).mockResolvedValueOnce({
      updateProjectV2DraftIssue: {
        draftIssue: {
          id: 'DI_resolved_789',
          title: 'Updated Title',
          body: 'Updated body content',
        },
      },
    });

    await tool.execute({ ...validParams, body: 'Updated body content' });

    const [, mutationVars] = mocks.graphql.mock.calls[1] as unknown[];
    expect((mutationVars as any).body).toBe('Updated body content');
  });

  it('throws when item is not a draft issue', async () => {
    mocks.graphql.mockResolvedValueOnce({ node: { content: null } });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('is not a draft issue or was not found');
  });

  it('throws when item node is not found', async () => {
    mocks.graphql.mockResolvedValueOnce({ node: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('is not a draft issue or was not found');
  });

  it('throws on partial null mutation response', async () => {
    mocks.graphql
      .mockResolvedValueOnce(mockResolveResponse)
      .mockResolvedValueOnce({ updateProjectV2DraftIssue: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to update draft issue');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('Draft issue not found'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Draft issue not found');
  });
});
