import { beforeEach, describe, expect, it } from 'bun:test';
import { setupGitHubMocks } from '../__test__/test-utils';
import {
  GithubGetPrReviewThreadsTool,
  GithubGetPrReviewThreadsToolParams,
  GithubGetPrReviewThreadsToolSchema,
} from './get-pr-review-threads-tool';

// Set up GitHub mocks before importing the file to be tested
const mocks = setupGitHubMocks();

describe('GithubGetPrReviewThreadsTool', () => {
  let tool: GithubGetPrReviewThreadsTool;

  const validParams: GithubGetPrReviewThreadsToolParams = {
    org: 'test-org',
    repo: 'test-repo',
    pull_number: 123,
    per_page: 2,
    comments_per_thread: 20,
  };

  const mockResponse = {
    repository: {
      pullRequest: {
        reviewThreads: {
          totalCount: 2,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: 'PRRT_thread_1',
              isResolved: false,
              isOutdated: false,
              isCollapsed: false,
              path: 'src/index.ts',
              line: 10,
              originalLine: 9,
              startLine: 10,
              originalStartLine: 9,
              comments: {
                nodes: [
                  {
                    id: 'PRRC_comment_1',
                    databaseId: 101,
                    body: 'Nit: rename variable',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T01:00:00Z',
                    isMinimized: false,
                    minimizedReason: null,
                    author: { login: 'reviewer1' },
                  },
                ],
              },
            },
            {
              id: 'PRRT_thread_2',
              isResolved: true,
              isOutdated: false,
              isCollapsed: false,
              path: 'src/app.ts',
              line: 20,
              originalLine: 20,
              startLine: 20,
              originalStartLine: 20,
              comments: {
                nodes: [
                  {
                    id: 'PRRC_comment_2',
                    databaseId: 102,
                    body: 'Looks good now',
                    createdAt: '2024-01-02T00:00:00Z',
                    updatedAt: '2024-01-02T00:30:00Z',
                    isMinimized: false,
                    minimizedReason: null,
                    author: { login: 'reviewer2' },
                  },
                ],
              },
            },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    tool = new GithubGetPrReviewThreadsTool();
    mocks.graphql.mockReset();
  });

  describe('schema validation', () => {
    it('accepts valid parameters', () => {
      const result = GithubGetPrReviewThreadsToolSchema.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('rejects missing required fields', () => {
      const result = GithubGetPrReviewThreadsToolSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  it('returns mapped review threads', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(2);
    expect(parsed.pageInfo.hasNextPage).toBe(false);
    expect(parsed.threads).toHaveLength(2);
    expect(parsed.threads[0].id).toBe('PRRT_thread_1');
    expect(parsed.threads[0].comments[0].authorLogin).toBe('reviewer1');
  });

  it('calls GraphQL with correct variables', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute(validParams);

    expect(mocks.graphql).toHaveBeenCalled();
    const [query, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect(String(query)).toContain('reviewThreads');
    expect((variables as any).owner).toBe('test-org');
    expect((variables as any).repo).toBe('test-repo');
    expect((variables as any).pullNumber).toBe(123);
    expect((variables as any).perPage).toBe(2);
    expect((variables as any).commentsPerThread).toBe(20);
  });

  it('passes custom comments_per_thread to GraphQL', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({ ...validParams, comments_per_thread: 50 });

    expect(mocks.graphql).toHaveBeenCalled();
    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).commentsPerThread).toBe(50);
  });

  it('throws when pull request is missing', async () => {
    mocks.graphql.mockResolvedValue({ repository: { pullRequest: null } });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain('Pull request #123 not found in test-org/test-repo');
  });

  it('throws when repository is not found', async () => {
    mocks.graphql.mockResolvedValue({ repository: null });

    let error: Error | undefined;
    try {
      await tool.execute(validParams);
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error?.message).toContain("Repository 'test-org/test-repo' not found or inaccessible");
  });

  it('returns empty threads array when no review threads exist', async () => {
    mocks.graphql.mockResolvedValue({
      repository: {
        pullRequest: {
          reviewThreads: {
            totalCount: 0,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [],
          },
        },
      },
    });

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(0);
    expect(parsed.threads).toHaveLength(0);
  });

  it('returns pagination info when hasNextPage is true', async () => {
    const paginatedResponse = {
      repository: {
        pullRequest: {
          reviewThreads: {
            totalCount: 50,
            pageInfo: { hasNextPage: true, endCursor: 'cursor_abc123' },
            nodes: [
              {
                id: 'PRRT_thread_1',
                isResolved: false,
                isOutdated: false,
                isCollapsed: false,
                path: 'src/index.ts',
                line: 10,
                originalLine: 9,
                startLine: 10,
                originalStartLine: 9,
                comments: {
                  nodes: [
                    {
                      id: 'PRRC_comment_1',
                      databaseId: 101,
                      body: 'First comment',
                      createdAt: '2024-01-01T00:00:00Z',
                      updatedAt: '2024-01-01T01:00:00Z',
                      isMinimized: false,
                      minimizedReason: null,
                      author: { login: 'reviewer1' },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    mocks.graphql.mockResolvedValue(paginatedResponse);

    const output = await tool.execute(validParams);
    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.totalCount).toBe(50);
    expect(parsed.pageInfo.hasNextPage).toBe(true);
    expect(parsed.pageInfo.endCursor).toBe('cursor_abc123');
    expect(parsed.threads).toHaveLength(1);
  });

  it('passes after cursor for pagination', async () => {
    mocks.graphql.mockResolvedValue(mockResponse);

    await tool.execute({ ...validParams, after: 'cursor_xyz' });

    expect(mocks.graphql).toHaveBeenCalled();
    const [, variables] = mocks.graphql.mock.calls[0] as unknown[];
    expect((variables as any).after).toBe('cursor_xyz');
  });
});
