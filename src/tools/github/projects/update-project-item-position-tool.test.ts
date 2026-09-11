import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  UpdateGithubProjectItemPositionTool,
  UpdateGithubProjectItemPositionToolParams,
  UpdateGithubProjectItemPositionToolSchema,
} from './update-project-item-position-tool';

describe('UpdateGithubProjectItemPositionTool', () => {
  let tool: UpdateGithubProjectItemPositionTool;

  const validParams: UpdateGithubProjectItemPositionToolParams = {
    project_id: 'PVT_kwDOTest123',
    item_id: 'PVTI_kwDOTest456',
  };

  const mockResponse = {
    updateProjectV2ItemPosition: {
      items: {
        nodes: [{ id: 'PVTI_kwDOTest456' }],
      },
    },
  };

  beforeEach(() => {
    tool = new UpdateGithubProjectItemPositionTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = UpdateGithubProjectItemPositionToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts valid parameters with optional after_id', () => {
      const result = UpdateGithubProjectItemPositionToolSchema.safeParse({
        ...validParams,
        after_id: 'PVTI_kwDOAfter789',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = UpdateGithubProjectItemPositionToolSchema.safeParse({
        item_id: 'PVTI_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing item_id', () => {
      const result = UpdateGithubProjectItemPositionToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the updated item ID', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.itemId).toBe('PVTI_kwDOTest456');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('updateProjectV2ItemPosition');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).itemId).toBe('PVTI_kwDOTest456');
  });

  it('passes after_id when provided', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({ ...validParams, after_id: 'PVTI_kwDOAfter789' });

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).afterId).toBe('PVTI_kwDOAfter789');
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ updateProjectV2ItemPosition: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to update item position');
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
