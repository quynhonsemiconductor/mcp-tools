import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  DeleteGithubProjectFieldTool,
  DeleteGithubProjectFieldToolParams,
  DeleteGithubProjectFieldToolSchema,
} from './delete-project-field-tool';

describe('DeleteGithubProjectFieldTool', () => {
  let tool: DeleteGithubProjectFieldTool;

  const validParams: DeleteGithubProjectFieldToolParams = {
    project_id: 'PVT_kwDOTest123',
    field_id: 'PVTF_kwDOTest789',
  };

  const mockResponse = {
    deleteProjectV2Field: {
      projectV2Field: {
        id: 'PVTF_kwDOTest789',
      },
    },
  };

  beforeEach(() => {
    tool = new DeleteGithubProjectFieldTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = DeleteGithubProjectFieldToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = DeleteGithubProjectFieldToolSchema.safeParse({
        field_id: 'PVTF_test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing field_id', () => {
      const result = DeleteGithubProjectFieldToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(false);
    });
  });

  it('returns the deleted field ID', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.deletedFieldId).toBe('PVTF_kwDOTest789');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('deleteProjectV2Field');
    expect((variables as any).projectId).toBeUndefined();
    expect((variables as any).fieldId).toBe('PVTF_kwDOTest789');
  });

  it('throws on partial null response', async () => {
    mocks.graphql.mockResolvedValue({ deleteProjectV2Field: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Failed to delete field');
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
