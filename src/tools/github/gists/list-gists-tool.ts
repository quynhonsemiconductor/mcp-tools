import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the List Github Gists tool parameters
 */
export const GithubGistListSchema = z.object({
  username: z
    .string()
    .optional()
    .describe('Username to list gists for. If not provided, lists gists for authenticated user'),
  since: z
    .string()
    .optional()
    .describe('Only show gists updated after the given time (ISO 8601 format)'),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  page: z.number().int().min(1).default(1).describe('Page number of the results to fetch'),
});

/**
 * Type for the List Github Gists tool parameters
 */
export type GithubGistListToolParams = z.input<typeof GithubGistListSchema>;

/**
 * List Github Gists - Lists gists for a user or authenticated user
 */
@Tool({
  id: 'github-gist-list',
  name: 'listGithubGists',
  description: 'Lists gists for a user or authenticated user',
  category: 'Github: Gists',
  parameters: GithubGistListSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'List Github Gists',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubGistListTool extends GithubBaseTool {
  /**
   * Execute the List Github Gists tool
   */
  @CatchErrors()
  async execute(args: GithubGistListToolParams): Promise<string> {
    const validatedArgs = GithubGistListSchema.parse(args);

    let response;

    if (validatedArgs.username) {
      // List gists for a specific user
      response = await this.getClient().rest.gists.listForUser({
        username: validatedArgs.username,
        since: validatedArgs.since,
        per_page: validatedArgs.per_page,
        page: validatedArgs.page,
      });
    } else {
      // List gists for authenticated user
      response = await this.getClient().rest.gists.list({
        since: validatedArgs.since,
        per_page: validatedArgs.per_page,
        page: validatedArgs.page,
      });
    }

    return this.cleanResponse(response);
  }
}
