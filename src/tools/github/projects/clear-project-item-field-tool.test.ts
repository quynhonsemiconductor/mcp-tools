import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  ClearGithubProjectItemFieldTool,
  ClearGithubProjectItemFieldToolParams,
  ClearGithubProjectItemFieldToolSchema,
} from './clear-project-item-field-tool';

describe('ClearGithubProjectItemFieldTool', () => {
  let tool: ClearGithubProjectItemFieldTool;

  const validParams: ClearGithubProjectItemFieldToolParams = {
    project_id: 'PVT_kwDOTest123',
    item_id: 'PVTI_kwDOTest456',
    field_id: 'PVTF_kwDOTest789',
  };

  const mockResponse = {
    clearProjectV2ItemFieldValue: {
      projectV2Item: {
        id: 'PVTI_kwDOTest456',
      },
    },
  };

  beforeEach(() => {
    tool = new ClearGithubProjectItemFieldTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = ClearGithubProjectItemFieldToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = ClearGithubProjectItemFieldToolSchema.safeParse({
        item_id: 'PVTI_test',
        field_id: 'PVTF_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing item_id', () => {
      const result = ClearGithubProjectItemFieldToolSchema.safeParse({
        project_id: 'PVT_test',
        field_id: 'PVTF_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing field_id', () => {
      const result = ClearGithubProjectItemFieldToolSchema.safeParse({
        project_id: 'PVT_test',
        item_id: 'PVTI_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the cleared item ID', async () => {
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
    expect(String(query)).toContain('clearProjectV2ItemFieldValue');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).itemId).toBe('PVTI_kwDOTest456');
    expect((variables as any).fieldId).toBe('PVTF_kwDOTest789');
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ clearProjectV2ItemFieldValue: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to clear field value');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('Field not found'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Field not found');
  });
});
