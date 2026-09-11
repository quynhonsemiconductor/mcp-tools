import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the List Github Pull Requests tool parameters
 */
export const GithubPullRequestListSchema = createGithubBaseSchema({
  state: z
    .enum(['open', 'closed', 'all'])
    .optional()
    .describe("PR state ('open', 'closed', 'all')"),
  sort: z
    .enum(['created', 'updated', 'popularity', 'long-running'])
    .optional()
    .describe("Sort field ('created', 'updated', 'popularity', 'long-running')"),
  direction: z.enum(['asc', 'desc']).optional().describe("Sort direction ('asc', 'desc')"),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the List Github Pull Requests tool parameters
 */
export type GithubPullRequestListToolParams = z.input<typeof GithubPullRequestListSchema>;

/**
 * List Github Pull Requests - Lists and filters repository pull requests
 */
@Tool({
  id: 'github-pulls-list',
  name: 'listGithubPullRequests',
  description: 'Lists and filters repository pull requests',
  category: 'Github: Pulls',
  parameters: GithubPullRequestListSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'List Github Pull Requests',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubPullRequestListTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestListToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestListSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.list(apiParams), true);
  }
}
