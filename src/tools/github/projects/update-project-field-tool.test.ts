import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  UpdateGithubProjectFieldTool,
  UpdateGithubProjectFieldToolParams,
  UpdateGithubProjectFieldToolSchema,
} from './update-project-field-tool';

describe('UpdateGithubProjectFieldTool', () => {
  let tool: UpdateGithubProjectFieldTool;

  const validParams: UpdateGithubProjectFieldToolParams = {
    field_id: 'PVTF_kwDOTest789',
    name: 'New Name',
  };

  const mockResponse = {
    updateProjectV2Field: {
      projectV2Field: {
        __typename: 'ProjectV2Field',
        id: 'PVTF_kwDOTest789',
        name: 'New Name',
        dataType: 'TEXT',
      },
    },
  };

  beforeEach(() => {
    tool = new UpdateGithubProjectFieldTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = UpdateGithubProjectFieldToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts parameters with single_select_options', () => {
      const result = UpdateGithubProjectFieldToolSchema.safeParse({
        field_id: 'PVTF_kwDOTest789',
        single_select_options: [{ name: 'Option A' }, { name: 'Option B' }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing field_id', () => {
      const result = UpdateGithubProjectFieldToolSchema.safeParse({
        name: 'New Name',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the updated field', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.field.name).toBe('New Name');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('updateProjectV2Field');
    expect((variables as any).fieldId).toBe('PVTF_kwDOTest789');
    expect((variables as any).name).toBe('New Name');
  });

  it('passes single_select_options when provided', async () => {
    mocks.graphql.mockResolvedValue({
      updateProjectV2Field: {
        projectV2Field: {
          __typename: 'ProjectV2SingleSelectField',
          id: 'PVTF_kwDOTest789',
          name: 'Status',
          dataType: 'SINGLE_SELECT',
        },
      },
    });

    await tool.execute({
      field_id: 'PVTF_kwDOTest789',
      single_select_options: [{ name: 'Option A' }, { name: 'Option B' }],
    });

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).singleSelectOptions).toEqual([
      { name: 'Option A' },
      { name: 'Option B' },
    ]);
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ updateProjectV2Field: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to update field');
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
