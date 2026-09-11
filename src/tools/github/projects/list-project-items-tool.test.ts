import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks, MOCK_DATA } from '../__test__/test-utils';

const mocks = setupGitHubMocks();

import {
  ListGithubProjectItemsTool,
  ListGithubProjectItemsToolParams,
  ListGithubProjectItemsToolSchema,
} from './list-project-items-tool';

describe('ListGithubProjectItemsTool', () => {
  let tool: ListGithubProjectItemsTool;

  const validParams: ListGithubProjectItemsToolParams = {
    project_id: 'PVT_kwDOTest123',
    per_page: 20,
  };

  const mockResponse = {
    node: {
      __typename: 'ProjectV2',
      items: {
        totalCount: 2,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            ...MOCK_DATA.projectV2Item,
            isArchived: false,
          },
          {
            id: 'PVTI_kwDOTest789',
            type: 'PULL_REQUEST',
            isArchived: false,
            content: {
              __typename: 'PullRequest',
              title: 'Test PR',
              number: 10,
              state: 'OPEN',
              url: 'https://github.com/test-org/test-repo/pull/10',
            },
            fieldValues: {
              nodes: [
                {
                  __typename: 'ProjectV2ItemFieldSingleSelectValue',
                  name: 'In Progress',
                  field: { name: 'Status' },
                },
              ],
            },
          },
        ],
      },
    },
  };

  beforeEach(() => {
    tool = new ListGithubProjectItemsTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = ListGithubProjectItemsToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing project_id', () => {
      const result = ListGithubProjectItemsToolSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('applies default per_page', () => {
      const result = ListGithubProjectItemsToolSchema.safeParse({
        project_id: 'PVT_test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.per_page).toBe(20);
      }
    });
  });

  it('returns mapped items with field values', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(2);
    expect(parsed.items).toHaveLength(2);

    // Issue item
    expect(parsed.items[0].id).toBe('PVTI_kwDOTest456');
    expect(parsed.items[0].type).toBe('ISSUE');
    expect(parsed.items[0].content.title).toBe('Test Issue');
    expect(parsed.items[0].content.number).toBe(42);
    expect(parsed.items[0].fieldValues).toHaveLength(2);

    // PR item
    expect(parsed.items[1].type).toBe('PULL_REQUEST');
    expect(parsed.items[1].content.title).toBe('Test PR');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('ProjectV2');
    expect((variables as any).projectId).toBe('PVT_kwDOTest123');
    expect((variables as any).perPage).toBe(20);
  });

  it('passes after cursor for pagination', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({ ...validParams, after: 'cursor_xyz' });

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).after).toBe('cursor_xyz');
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

  it('returns empty items array when project has no items', async () => {
    mocks.graphql.mockResolvedValue({
      node: {
        __typename: 'ProjectV2',
        items: {
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
    expect(parsed.items).toHaveLength(0);
  });

  it('handles items with null content (draft issues)', async () => {
    mocks.graphql.mockResolvedValue({
      node: {
        __typename: 'ProjectV2',
        items: {
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: 'PVTI_draft',
              type: 'DRAFT_ISSUE',
              isArchived: false,
              content: {
                __typename: 'DraftIssue',
                title: 'Draft item',
                body: 'Draft body',
              },
              fieldValues: { nodes: [] },
            },
          ],
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.items[0].type).toBe('DRAFT_ISSUE');
    expect(parsed.items[0].content.title).toBe('Draft item');
    expect(parsed.items[0].content.number).toBeNull();
  });

  it('returns pagination info when hasNextPage is true', async () => {
    mocks.graphql.mockResolvedValue({
      node: {
        __typename: 'ProjectV2',
        items: {
          totalCount: 100,
          pageInfo: { hasNextPage: true, endCursor: 'cursor_page2' },
          nodes: [
            {
              ...MOCK_DATA.projectV2Item,
              isArchived: false,
            },
          ],
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.pageInfo.hasNextPage).toBe(true);
    expect(parsed.pageInfo.endCursor).toBe('cursor_page2');
  });

  it('maps assignees and labels from issue content', async () => {
    mocks.graphql.mockResolvedValue({
      node: {
        __typename: 'ProjectV2',
        items: {
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: 'PVTI_with_meta',
              type: 'ISSUE',
              isArchived: false,
              content: {
                __typename: 'Issue',
                id: 'I_123',
                title: 'Issue with metadata',
                number: 99,
                state: 'OPEN',
                url: 'https://github.com/test-org/test-repo/issues/99',
                body: 'Issue body',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
                closedAt: null,
                author: { login: 'testuser' },
                assignees: {
                  nodes: [{ login: 'dev1' }, { login: 'dev2' }],
                },
                labels: {
                  nodes: [{ name: 'bug' }, { name: 'priority:high' }],
                },
              },
              fieldValues: { nodes: [] },
            },
          ],
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    const content = parsed.items[0].content;
    expect(content.assignees).toEqual(['dev1', 'dev2']);
    expect(content.labels).toEqual(['bug', 'priority:high']);
    expect(content.author).toBe('testuser');
    expect(content.body).toBe('Issue body');
  });

  it('maps pullRequest and repository field values', async () => {
    mocks.graphql.mockResolvedValue({
      node: {
        __typename: 'ProjectV2',
        items: {
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: 'PVTI_fieldtypes',
              type: 'ISSUE',
              isArchived: false,
              content: null,
              fieldValues: {
                nodes: [
                  {
                    __typename: 'ProjectV2ItemFieldPullRequestValue',
                    pullRequests: {
                      nodes: [
                        {
                          title: 'Fix bug',
                          number: 7,
                          url: 'https://github.com/org/repo/pull/7',
                        },
                      ],
                    },
                    field: { name: 'Linked PR' },
                  },
                  {
                    __typename: 'ProjectV2ItemFieldRepositoryValue',
                    repository: {
                      nameWithOwner: 'org/repo',
                      url: 'https://github.com/org/repo',
                    },
                    field: { name: 'Repository' },
                  },
                  {
                    __typename: 'ProjectV2ItemFieldLabelValue',
                    labels: { nodes: [{ name: 'urgent' }] },
                    field: { name: 'Labels' },
                  },
                  {
                    __typename: 'ProjectV2ItemFieldMilestoneValue',
                    milestone: { title: 'v2.0' },
                    field: { name: 'Milestone' },
                  },
                  {
                    __typename: 'ProjectV2ItemFieldUserValue',
                    users: { nodes: [{ login: 'dev1' }] },
                    field: { name: 'Assignee' },
                  },
                  {
                    __typename: 'ProjectV2ItemFieldReviewerValue',
                    reviewers: {
                      nodes: [{ login: 'reviewer1' }, { name: 'team-a', slug: 'team-a' }],
                    },
                    field: { name: 'Reviewers' },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    const fieldValues = parsed.items[0].fieldValues;
    expect(fieldValues[0].pullRequests).toEqual([
      { title: 'Fix bug', number: 7, url: 'https://github.com/org/repo/pull/7' },
    ]);
    expect(fieldValues[1].repository).toEqual({
      nameWithOwner: 'org/repo',
      url: 'https://github.com/org/repo',
    });
    expect(fieldValues[2].labels).toEqual(['urgent']);
    expect(fieldValues[3].milestone).toBe('v2.0');
    expect(fieldValues[4].users).toEqual(['dev1']);
    expect(fieldValues[5].reviewers).toEqual(['reviewer1', 'team-a']);
  });
});
