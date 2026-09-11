import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  AddGithubProjectItemTool,
  AddGithubProjectItemToolParams,
  AddGithubProjectItemToolSchema,
} from './add-project-item-tool';

describe('AddGithubProjectItemTool', () => {
  let tool: AddGithubProjectItemTool;

  const validParams: AddGithubProjectItemToolParams = {
    project_id: 'PVT_kwDOTest123',
    content_id: 'I_kwDOIssue456',
  };

  const mockResponse = {
    addProjectV2ItemById: {
      item: {
        id: 'PVTI_kwDONew789',
        type: 'ISSUE',
        content: {
          __typename: 'Issue',
          title: 'Test Issue',
          number: 42,
        },
      },
    },
  };

  beforeEach(() => {
    tool = new AddGithubProjectItemTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = AddGithubProjectItemToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = AddGithubProjectItemToolSchema.safeParse({
        content_id: 'I_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing content_id', () => {
      const result = AddGithubProjectItemToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the created item', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.item.id).toBe('PVTI_kwDONew789');
    expect(parsed.item.type).toBe('ISSUE');
    expect(parsed.item.content.type).toBe('Issue');
    expect(parsed.item.content.title).toBe('Test Issue');
    expect(parsed.item.content.number).toBe(42);
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('addProjectV2ItemById');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).contentId).toBe('I_kwDOIssue456');
  });

  it('handles PR content type', async () => {
    mocks.graphql.mockResolvedValue({
      addProjectV2ItemById: {
        item: {
          id: 'PVTI_kwDOPR123',
          type: 'PULL_REQUEST',
          content: {
            __typename: 'PullRequest',
            title: 'Test PR',
            number: 10,
          },
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.item.type).toBe('PULL_REQUEST');
    expect(parsed.item.content.type).toBe('PullRequest');
  });

  it('handles null content gracefully', async () => {
    mocks.graphql.mockResolvedValue({
      addProjectV2ItemById: {
        item: {
          id: 'PVTI_kwDONull',
          type: 'ISSUE',
          content: null,
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.item.content).toBeNull();
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ addProjectV2ItemById: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to add item to project');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('GraphQL error'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('GraphQL error');
  });
});
