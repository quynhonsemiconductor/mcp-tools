import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks, MOCK_DATA } from '../__test__/test-utils';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

import {
  ListGithubProjectsTool,
  ListGithubProjectsToolParams,
  ListGithubProjectsToolSchema,
} from './list-projects-tool';

describe('ListGithubProjectsTool', () => {
  let tool: ListGithubProjectsTool;

  const validParams: ListGithubProjectsToolParams = {
    org: 'test-org',
    per_page: 20,
  };

  const mockResponse = {
    organization: {
      projectsV2: {
        totalCount: 2,
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          MOCK_DATA.projectV2,
          {
            ...MOCK_DATA.projectV2,
            id: 'PVT_kwDOTest456',
            number: 2,
            title: 'Another Project',
            closed: true,
          },
        ],
      },
    },
  };

  beforeEach(() => {
    tool = new ListGithubProjectsTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts org parameter', () => {
      const result = ListGithubProjectsToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('accepts user parameter', () => {
      const result = ListGithubProjectsToolSchema.safeParse({
        user: 'test-user',
        per_page: 20,
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional query parameter', () => {
      const result = ListGithubProjectsToolSchema.safeParse({
        ...validParams,
        query: 'search term',
      });
      expect(result.success).toBe(true);
    });

    it('rejects when both org and user are provided', () => {
      const result = ListGithubProjectsToolSchema.safeParse({
        org: 'test-org',
        user: 'test-user',
      });
      expect(result.success).toBe(false);
    });

    it('rejects when neither org nor user is provided', () => {
      const result = ListGithubProjectsToolSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('applies default per_page', () => {
      const result = ListGithubProjectsToolSchema.safeParse({
        org: 'test-org',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.per_page).toBe(20);
      }
    });
  });

  it('returns mapped projects for org', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(2);
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.projects[0].id).toBe('PVT_kwDOTest123');
    expect(parsed.projects[0].title).toBe('Test Project');
    expect(parsed.projects[0].creator).toBe('testuser');
    expect(parsed.projects[1].closed).toBe(true);
  });

  it('returns mapped projects for user', async () => {
    mocks.graphql.mockResolvedValue({
      user: {
        projectsV2: {
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [MOCK_DATA.projectV2],
        },
      },
    });

    const output = await tool.execute({ user: 'test-user', per_page: 20 });
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.projects[0].title).toBe('Test Project');
  });

  it('calls GraphQL with organization query for org param', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({ ...validParams, query: 'search' });

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('organization(login:');
    expect((variables as any).login).toBe('test-org');
    expect((variables as any).perPage).toBe(20);
    expect((variables as any).searchQuery).toBe('search');
    expect((variables as any).query).toBeUndefined();
  });

  it('calls GraphQL with user query for user param', async () => {
    mocks.graphql.mockResolvedValue({
      user: {
        projectsV2: {
          totalCount: 0,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [],
        },
      },
    });

    await tool.execute({ user: 'test-user', per_page: 10 });

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('user(login:');
    expect((variables as any).login).toBe('test-user');
  });

  it('passes after cursor for pagination', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({ ...validParams, after: 'cursor_abc' });

    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).after).toBe('cursor_abc');
  });

  it('returns pagination info when hasNextPage is true', async () => {
    mocks.graphql.mockResolvedValue({
      organization: {
        projectsV2: {
          totalCount: 50,
          pageInfo: { hasNextPage: true, endCursor: 'cursor_xyz' },
          nodes: [MOCK_DATA.projectV2],
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.pageInfo.hasNextPage).toBe(true);
    expect(parsed.pageInfo.endCursor).toBe('cursor_xyz');
  });

  it('throws when organization is not found', async () => {
    mocks.graphql.mockResolvedValue({ organization: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("Organization 'test-org' not found");
  });

  it('throws when user is not found', async () => {
    mocks.graphql.mockResolvedValue({ user: null });

    let error: Error | undefined;
    try {
      await tool.execute({ user: 'nonexistent', per_page: 20 });
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("User 'nonexistent' not found");
  });

  it('returns empty projects array when none exist', async () => {
    mocks.graphql.mockResolvedValue({
      organization: {
        projectsV2: {
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
    expect(parsed.projects).toHaveLength(0);
  });

  it('handles null creator gracefully', async () => {
    mocks.graphql.mockResolvedValue({
      organization: {
        projectsV2: {
          totalCount: 1,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ ...MOCK_DATA.projectV2, creator: null }],
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.projects[0].creator).toBeNull();
  });
});
