import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks, MOCK_DATA } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  ListGithubProjectFieldsTool,
  ListGithubProjectFieldsToolParams,
  ListGithubProjectFieldsToolSchema,
} from './list-project-fields-tool';

describe('ListGithubProjectFieldsTool', () => {
  let tool: ListGithubProjectFieldsTool;

  const validParams: ListGithubProjectFieldsToolParams = {
    project_id: 'PVT_kwDOTest123',
    per_page: 50,
  };

  const mockResponse = {
    node: {
      __typename: 'ProjectV2',
      fields: {
        totalCount: 3,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            __typename: 'ProjectV2Field',
            id: 'PVTF_field1',
            name: 'Title',
            dataType: 'TEXT',
          },
          {
            __typename: 'ProjectV2SingleSelectField',
            id: MOCK_DATA.projectV2Field.id,
            name: MOCK_DATA.projectV2Field.name,
            dataType: MOCK_DATA.projectV2Field.dataType,
            options: MOCK_DATA.projectV2Field.options,
          },
          {
            __typename: 'ProjectV2IterationField',
            id: 'PVTF_iter1',
            name: 'Sprint',
            dataType: 'ITERATION',
            configuration: {
              iterations: [
                {
                  id: 'iter_1',
                  title: 'Sprint 1',
                  startDate: '2024-01-01',
                  duration: 14,
                },
              ],
            },
          },
        ],
      },
    },
  };

  beforeEach(() => {
    tool = new ListGithubProjectFieldsTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = ListGithubProjectFieldsToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = ListGithubProjectFieldsToolSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('applies default per_page of 50', () => {
      const result = ListGithubProjectFieldsToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.per_page).toBe(50);
      }
    });
  });

  it('returns mapped fields with options and iterations', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(3);
    expect(parsed.fields).toHaveLength(3);

    // Text field
    expect(parsed.fields[0].name).toBe('Title');
    expect(parsed.fields[0].dataType).toBe('TEXT');
    expect(parsed.fields[0].type).toBe('ProjectV2Field');

    // Single-select field with options
    expect(parsed.fields[1].name).toBe('Status');
    expect(parsed.fields[1].options).toHaveLength(3);
    expect(parsed.fields[1].options[0].name).toBe('Todo');

    // Iteration field
    expect(parsed.fields[2].name).toBe('Sprint');
    expect(parsed.fields[2].iterations).toHaveLength(1);
    expect(parsed.fields[2].iterations[0].title).toBe('Sprint 1');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('ProjectV2');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).perPage).toBe(50);
  });

  it('passes after cursor for pagination', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({ ...validParams, after: 'cursor_abc' });

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).after).toBe('cursor_abc');
  });

  it('throws when project is not found', async () => {
    mocks.graphql.mockResolvedValue({ node: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("Project with ID 'PVT_kwDOTest123' not found");
  });

  it('throws when node ID resolves to a non-ProjectV2 type', async () => {
    mocks.graphql.mockResolvedValue({ node: {} });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("Project with ID 'PVT_kwDOTest123' not found");
  });

  it('returns empty fields array when none exist', async () => {
    mocks.graphql.mockResolvedValue({
      node: {
        __typename: 'ProjectV2',
        fields: {
          totalCount: 0,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [],
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(0);
    expect(parsed.fields).toHaveLength(0);
  });
});
