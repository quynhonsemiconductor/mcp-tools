import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get GitHub Pull Request Review Threads tool parameters
 */
export const GithubGetPrReviewThreadsToolSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Number of review threads to return'),
  comments_per_thread: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Number of comments to return per thread'),
  after: z
    .string()
    .optional()
    .describe('Cursor for pagination to fetch the next page of review threads'),
});

/**
 * Type for the Get GitHub Pull Request Review Threads tool parameters
 */
export type GithubGetPrReviewThreadsToolParams = z.infer<typeof GithubGetPrReviewThreadsToolSchema>;

interface ReviewCommentNode {
  id: string;
  databaseId?: number | null;
  body: string;
  author?: { login?: string | null } | null;
  createdAt: string;
  updatedAt: string;
  isMinimized?: boolean | null;
  minimizedReason?: string | null;
}

interface ReviewThreadNode {
  id: string;
  isResolved: boolean;
  isOutdated?: boolean;
  isCollapsed?: boolean;
  path?: string | null;
  line?: number | null;
  originalLine?: number | null;
  startLine?: number | null;
  originalStartLine?: number | null;
  comments: {
    nodes: ReviewCommentNode[];
  };
}

interface ReviewThreadsResponse {
  repository: {
    pullRequest: {
      reviewThreads: {
        totalCount: number;
        pageInfo: {
          hasNextPage: boolean;
          endCursor: string | null;
        };
        nodes: ReviewThreadNode[];
      };
    } | null;
  } | null;
}

/**
 * Maps a review thread node into a clean JSON-friendly shape
 */
function mapReviewThread(thread: ReviewThreadNode) {
  return {
    id: thread.id,
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated ?? null,
    isCollapsed: thread.isCollapsed ?? null,
    path: thread.path ?? null,
    line: thread.line ?? null,
    originalLine: thread.originalLine ?? null,
    startLine: thread.startLine ?? null,
    originalStartLine: thread.originalStartLine ?? null,
    commentCount: thread.comments?.nodes?.length ?? 0,
    comments: (thread.comments?.nodes ?? []).map((comment) => ({
      id: comment.id,
      databaseId: comment.databaseId ?? null,
      body: comment.body,
      authorLogin: comment.author?.login ?? null,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isMinimized: comment.isMinimized ?? null,
      minimizedReason: comment.minimizedReason ?? null,
    })),
  };
}

/**
 * Get GitHub Pull Request Review Threads - Lists review threads for a pull request, including resolution state and comments
 */
@Tool({
  id: 'github-pulls-get-review-threads',
  name: 'getGithubPullRequestReviewThreads',
  description:
    'Lists review threads for a pull request, including resolution state and comment details.',
  category: 'Github: Pulls',
  parameters: GithubGetPrReviewThreadsToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get GitHub Pull Request Review Threads',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubGetPrReviewThreadsTool extends GithubBaseTool {
  /**
   * Execute the tool to list review threads on a pull request
   */
  @CatchErrors()
  async execute(args: GithubGetPrReviewThreadsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubGetPrReviewThreadsToolSchema, args);

    const {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: perPage,
      comments_per_thread: commentsPerThread,
      after,
    } = apiParams;

    const client = this.getClient();

    const response = await client.graphql<ReviewThreadsResponse>(
      `query GetReviewThreads(
          $owner: String!
          $repo: String!
          $pullNumber: Int!
          $perPage: Int!
          $commentsPerThread: Int!
          $after: String
        ) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $pullNumber) {
              reviewThreads(first: $perPage, after: $after) {
                totalCount
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  isResolved
                  isOutdated
                  isCollapsed
                  path
                  line
                  originalLine
                  startLine
                  originalStartLine
                  comments(first: $commentsPerThread) {
                    nodes {
                      id
                      databaseId
                      body
                      createdAt
                      updatedAt
                      isMinimized
                      minimizedReason
                      author {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      {
        owner,
        repo,
        pullNumber,
        perPage,
        commentsPerThread,
        after,
      },
    );

    if (!response.repository) {
      throw new Error(`Repository '${owner}/${repo}' not found or inaccessible`);
    }

    const reviewThreads = response.repository.pullRequest?.reviewThreads;

    if (!reviewThreads) {
      throw new Error(`Pull request #${pullNumber} not found in ${owner}/${repo}`);
    }

    return JSON.stringify({
      success: true,
      totalCount: reviewThreads.totalCount,
      pageInfo: reviewThreads.pageInfo,
      threads: reviewThreads.nodes.map(mapReviewThread),
    });
  }
}
