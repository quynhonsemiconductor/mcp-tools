import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Search Github Issues tool parameters
 */
export const GithubIssuesSearchSchema = z.object({
  query: z.string().min(1).describe('Search query'),
  sort: z.enum(['created', 'updated', 'comments']).optional().describe('Sort field'),
  order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
  page: z.number().int().min(1).optional().describe('Page number'),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
});

/**
 * Type for the Search Github Issues tool parameters
 */
export type GithubIssuesSearchToolParams = z.input<typeof GithubIssuesSearchSchema>;

/**
 * Search Github Issues - Searches for issues and pull requests
 */
@Tool({
  id: 'github-issues-search',
  name: 'searchGithubIssues',
  description: 'Searches for issues and pull requests across GitHub',
  category: 'Github: Issues',
  parameters: GithubIssuesSearchSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Search Github Issues',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubIssuesSearchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesSearchToolParams): Promise<string> {
    const validatedArgs = GithubIssuesSearchSchema.parse(args);

    const { query, sort, order, page, per_page } = validatedArgs;

    const apiParams: {
      q: string;
      sort?: 'created' | 'updated' | 'comments';
      order?: 'asc' | 'desc';
      page?: number;
      per_page?: number;
    } = { q: query };

    if (sort) apiParams.sort = sort;
    if (order) apiParams.order = order;
    if (page) apiParams.page = page;
    if (per_page) apiParams.per_page = per_page;

    return this.cleanResponse(
      await this.getClient().rest.search.issuesAndPullRequests(apiParams),
      true,
    );
  }
}
