import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the List Github Repositories tool parameters
 */
export const GithubReposListSchema = z.object({
  org: z
    .string()
    .min(1)
    .describe('The organization name. The name is not case sensitive. (required)'),
  type: z
    .enum(['all', 'public', 'private', 'forks', 'sources', 'member'])
    .optional()
    .describe(
      'Types of repositories you want returned. (optional - can be one of: all, public, private, forks, sources, member)',
    ),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the List Github Repositories tool parameters
 */
export type GithubReposListToolParams = z.infer<typeof GithubReposListSchema>;

/**
 * List Github Repositories - Lists all repositories in an organization
 */
@Tool({
  id: 'github-repos-list',
  name: 'listGithubRepositories',
  description: 'Lists all repositories in an organization',
  category: 'Github: Repos',
  parameters: GithubReposListSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'List Github Repositories',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubReposListTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubReposListToolParams): Promise<string> {
    return this.cleanResponse(await this.getClient().rest.repos.listForOrg(args), true);
  }
}
