import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  DeleteGithubProjectItemTool,
  DeleteGithubProjectItemToolParams,
  DeleteGithubProjectItemToolSchema,
} from './delete-project-item-tool';

describe('DeleteGithubProjectItemTool', () => {
  let tool: DeleteGithubProjectItemTool;

  const validParams: DeleteGithubProjectItemToolParams = {
    project_id: 'PVT_kwDOTest123',
    item_id: 'PVTI_kwDOTest456',
  };

  const mockResponse = {
    deleteProjectV2Item: {
      deletedItemId: 'PVTI_kwDOTest456',
    },
  };

  beforeEach(() => {
    tool = new DeleteGithubProjectItemTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = DeleteGithubProjectItemToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = DeleteGithubProjectItemToolSchema.safeParse({
        item_id: 'PVTI_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing item_id', () => {
      const result = DeleteGithubProjectItemToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the deleted item ID', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.deletedItemId).toBe('PVTI_kwDOTest456');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('deleteProjectV2Item');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).itemId).toBe('PVTI_kwDOTest456');
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ deleteProjectV2Item: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to delete project item');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('Item not found'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Item not found');
  });
});
