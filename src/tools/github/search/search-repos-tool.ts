import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Search Github Repositories tool parameters
 */
export const GithubReposSearchSchema = z.object({
  q: z.string().min(1).describe('The query contains one or more search keywords and qualifiers.'),
  per_page: z.number().int().min(1).max(100).default(10).describe('The number of results per page'),
  page: z.number().int().min(1).default(1).describe('The page number of the results to fetch'),
});

/**
 * Type for the Search Github Repositories tool parameters
 */
export type GithubReposSearchToolParams = z.input<typeof GithubReposSearchSchema>;

/**
 * Search Github Repositories - Searches for repositories based on a query
 */
@Tool({
  id: 'github-repos-search',
  name: 'searchRepos',
  description: 'Find repositories via various criteria.',
  category: 'Github: Search',
  parameters: GithubReposSearchSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Search Github Repositories',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubReposSearchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubReposSearchToolParams): Promise<string> {
    const validatedArgs = GithubReposSearchSchema.parse(args);

    const { q, per_page, page } = validatedArgs;

    const apiParams = {
      q,
      per_page,
      page,
    };

    return this.cleanResponse(await this.getClient().rest.search.repos(apiParams), true);
  }
}
