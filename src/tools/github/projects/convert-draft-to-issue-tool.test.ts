import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  ConvertGithubProjectDraftToIssueTool,
  ConvertGithubProjectDraftToIssueToolParams,
  ConvertGithubProjectDraftToIssueToolSchema,
} from './convert-draft-to-issue-tool';

describe('ConvertGithubProjectDraftToIssueTool', () => {
  let tool: ConvertGithubProjectDraftToIssueTool;

  const validParams: ConvertGithubProjectDraftToIssueToolParams = {
    item_id: 'PVTI_kwDODraft456',
    repository_id: 'R_kwDORepo789',
  };

  const mockResponse = {
    convertProjectV2DraftIssueItemToIssue: {
      item: {
        id: 'PVTI_kwDONew789',
        type: 'ISSUE',
        content: {
          __typename: 'Issue',
          title: 'Converted Issue',
          number: 42,
          url: 'https://github.com/test-org/test-repo/issues/42',
        },
      },
    },
  };

  beforeEach(() => {
    tool = new ConvertGithubProjectDraftToIssueTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = ConvertGithubProjectDraftToIssueToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing item_id', () => {
      const result = ConvertGithubProjectDraftToIssueToolSchema.safeParse({
        repository_id: 'R_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing repository_id', () => {
      const result = ConvertGithubProjectDraftToIssueToolSchema.safeParse({
        item_id: 'PVTI_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the converted issue item', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.item.type).toBe('ISSUE');
    expect(parsed.item.content.number).toBe(42);
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('convertProjectV2DraftIssueItemToIssue');
    expect((variables as any).itemId).toBe('PVTI_kwDODraft456');
    expect((variables as any).repositoryId).toBe('R_kwDORepo789');
    expect((variables as any).projectId).toBeUndefined();
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({
      convertProjectV2DraftIssueItemToIssue: null,
    });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to convert draft to issue');
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
