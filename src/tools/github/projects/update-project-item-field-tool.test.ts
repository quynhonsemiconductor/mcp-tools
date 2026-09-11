import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  UpdateGithubProjectItemFieldTool,
  UpdateGithubProjectItemFieldToolParams,
  UpdateGithubProjectItemFieldToolSchema,
} from './update-project-item-field-tool';

describe('UpdateGithubProjectItemFieldTool', () => {
  let tool: UpdateGithubProjectItemFieldTool;

  const validParams: UpdateGithubProjectItemFieldToolParams = {
    project_id: 'PVT_kwDOTest123',
    item_id: 'PVTI_kwDOTest456',
    field_id: 'PVTF_kwDOTest789',
    value: { text: 'Updated value' },
  };

  const mockResponse = {
    updateProjectV2ItemFieldValue: {
      projectV2Item: {
        id: 'PVTI_kwDOTest456',
      },
    },
  };

  beforeEach(() => {
    tool = new UpdateGithubProjectItemFieldTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts text value', () => {
      const result = UpdateGithubProjectItemFieldToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts number value', () => {
      const result = UpdateGithubProjectItemFieldToolSchema.safeParse({
        ...validParams,
        value: { number: 42 },
      });
      expect(result.success).toBe(true);
    });

    it('accepts date value', () => {
      const result = UpdateGithubProjectItemFieldToolSchema.safeParse({
        ...validParams,
        value: { date: '2024-01-15' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts singleSelectOptionId value', () => {
      const result = UpdateGithubProjectItemFieldToolSchema.safeParse({
        ...validParams,
        value: { singleSelectOptionId: 'opt1' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts iterationId value', () => {
      const result = UpdateGithubProjectItemFieldToolSchema.safeParse({
        ...validParams,
        value: { iterationId: 'iter_1' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid value shape', () => {
      const result = UpdateGithubProjectItemFieldToolSchema.safeParse({
        ...validParams,
        value: { invalid: 'value' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
      const result = UpdateGithubProjectItemFieldToolSchema.safeParse({});
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

  it('calls GraphQL with correct variables for text value', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('updateProjectV2ItemFieldValue');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).itemId).toBe('PVTI_kwDOTest456');
    expect((variables as any).fieldId).toBe('PVTF_kwDOTest789');
    expect((variables as any).value).toEqual({ text: 'Updated value' });
  });

  it('passes single select option ID correctly', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({
      ...validParams,
      value: { singleSelectOptionId: 'opt2' },
    });

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).value).toEqual({
      singleSelectOptionId: 'opt2',
    });
  });

  it('passes number value correctly', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({
      ...validParams,
      value: { number: 99.5 },
    });

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).value).toEqual({ number: 99.5 });
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({
      updateProjectV2ItemFieldValue: null,
    });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to update field value');
  });

  it('throws on GraphQL error', async () => {
    mocks.graphql.mockRejectedValue(new Error('Field type mismatch'));

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Field type mismatch');
  });
});
