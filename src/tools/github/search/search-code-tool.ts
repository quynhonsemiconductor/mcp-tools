import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Search Github Code tool parameters
 */
export const GithubCodeSearchSchema = z.object({
  q: z.string().min(1).describe('The query contains one or more search keywords and qualifiers.'),
  per_page: z.number().int().min(1).max(100).default(10).describe('The number of results per page'),
  page: z.number().int().min(1).default(1).describe('The page number of the results to fetch'),
});

/**
 * Type for the Search Github Code tool parameters
 */
export type GithubCodeSearchToolParams = z.input<typeof GithubCodeSearchSchema>;

/**
 * Search Github Code - Searches for code based on a query
 */
@Tool({
  id: 'github-code-search',
  name: 'searchCode',
  description: 'Searches for query terms inside of a file',
  category: 'Github: Search',
  parameters: GithubCodeSearchSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Search Github Code',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubCodeSearchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubCodeSearchToolParams): Promise<string> {
    const validatedArgs = GithubCodeSearchSchema.parse(args);

    const { q, per_page, page } = validatedArgs;

    const apiParams = {
      q,
      per_page,
      page,
    };

    return this.cleanResponse(await this.getClient().rest.search.code(apiParams), true);
  }
}
