import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  CreateGithubProjectFieldTool,
  CreateGithubProjectFieldToolParams,
  CreateGithubProjectFieldToolSchema,
} from './create-project-field-tool';

describe('CreateGithubProjectFieldTool', () => {
  let tool: CreateGithubProjectFieldTool;

  const validParams: CreateGithubProjectFieldToolParams = {
    project_id: 'PVT_kwDOTest123',
    name: 'Priority',
    data_type: 'SINGLE_SELECT',
    single_select_options: [{ name: 'High' }, { name: 'Low' }],
  };

  const mockResponse = {
    createProjectV2Field: {
      projectV2Field: {
        __typename: 'ProjectV2SingleSelectField',
        id: 'PVTF_kwDONew123',
        name: 'Priority',
        dataType: 'SINGLE_SELECT',
      },
    },
  };

  beforeEach(() => {
    tool = new CreateGithubProjectFieldTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = CreateGithubProjectFieldToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts parameters without single_select_options for TEXT type', () => {
      const result = CreateGithubProjectFieldToolSchema.safeParse({
        project_id: 'PVT_kwDOTest123',
        name: 'Notes',
        data_type: 'TEXT',
      });
      expect(result.success).toBe(true);
    });

    it('validates data_type enum', () => {
      const result = CreateGithubProjectFieldToolSchema.safeParse({
        project_id: 'PVT_kwDOTest123',
        name: 'Invalid',
        data_type: 'INVALID_TYPE',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing project_id', () => {
      const result = CreateGithubProjectFieldToolSchema.safeParse({
        name: 'Priority',
        data_type: 'TEXT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing name', () => {
      const result = CreateGithubProjectFieldToolSchema.safeParse({
        project_id: 'PVT_test',
        data_type: 'TEXT',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing data_type', () => {
      const result = CreateGithubProjectFieldToolSchema.safeParse({
        project_id: 'PVT_test',
        name: 'Priority',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the created field', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.field.name).toBe('Priority');
    expect(parsed.field.dataType).toBe('SINGLE_SELECT');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('createProjectV2Field');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).name).toBe('Priority');
    expect((variables as any).dataType).toBe('SINGLE_SELECT');
    expect((variables as any).singleSelectOptions).toEqual([{ name: 'High' }, { name: 'Low' }]);
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ createProjectV2Field: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to create field');
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
