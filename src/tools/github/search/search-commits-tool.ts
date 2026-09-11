import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Search Github Commits tool parameters
 */
export const GithubCommitsSearchSchema = z.object({
  q: z.string().min(1).describe('The query contains one or more search keywords and qualifiers.'),
  per_page: z.number().int().min(1).max(100).default(10).describe('The number of results per page'),
  page: z.number().int().min(1).default(1).describe('The page number of the results to fetch'),
});

/**
 * Type for the Search Github Commits tool parameters
 */
export type GithubCommitsSearchToolParams = z.input<typeof GithubCommitsSearchSchema>;

/**
 * Search Github Commits - Searches for commits based on a query
 */
@Tool({
  id: 'github-commits-search',
  name: 'searchCommits',
  description: 'Find commits via various criteria on the default branch',
  category: 'Github: Search',
  parameters: GithubCommitsSearchSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Search Github Commits',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubCommitsSearchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubCommitsSearchToolParams): Promise<string> {
    const validatedArgs = GithubCommitsSearchSchema.parse(args);

    const { q, per_page, page } = validatedArgs;

    const apiParams = {
      q,
      per_page,
      page,
    };

    return this.cleanResponse(await this.getClient().rest.search.commits(apiParams), true);
  }
}
