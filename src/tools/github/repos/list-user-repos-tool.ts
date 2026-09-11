import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the List User Github Repositories tool parameters
 */
export const GithubUserReposListSchema = z.object({
  username: z.string().min(1).describe('The handle for the GitHub user account. (required)'),
  type: z
    .enum(['all', 'owner', 'member'])
    .optional()
    .describe(
      'Limit results to repositories of the specified type. (optional - can be one of: all, owner, member)',
    ),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the List User Github Repositories tool parameters
 */
export type GithubUserReposListToolParams = z.input<typeof GithubUserReposListSchema>;

/**
 * List User Github Repositories - Lists public repositories for the specified user
 */
@Tool({
  id: 'github-user-repos-list',
  name: 'listUserGithubRepositories',
  description: 'Lists public repositories for the specified user',
  category: 'Github: Repos',
  parameters: GithubUserReposListSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'List User Github Repositories',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubUserReposListTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubUserReposListToolParams): Promise<string> {
    return this.cleanResponse(await this.getClient().rest.repos.listForUser(args), true);
  }
}
