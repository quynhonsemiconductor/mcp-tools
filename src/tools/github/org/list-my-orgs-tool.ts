import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the List My Github Organizations tool parameters
 */
export const GithubMyOrgsListSchema = z.object({
  username: z
    .string()
    .optional()
    .describe(
      'The username to get organizations for. If omitted, returns organizations for the authenticated user',
    ),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the List My Github Organizations tool parameters
 */
export type GithubMyOrgsListToolParams = z.input<typeof GithubMyOrgsListSchema>;

/**
 * List My Github Organizations - Lists all organizations for the current user
 */
@Tool({
  id: 'github-my-orgs-list',
  name: 'listMyGithubOrganizations',
  description: 'Lists all organizations for the current user',
  category: 'Github: Orgs',
  parameters: GithubMyOrgsListSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'List My Github Organizations',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubMyOrgsListTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubMyOrgsListToolParams): Promise<string> {
    const { username, per_page, page } = args;

    if (username) {
      return this.cleanResponse(
        await this.getClient().rest.orgs.listForUser({
          username,
          per_page,
          page,
        }),
        true,
      );
    } else {
      return this.cleanResponse(
        await this.getClient().rest.orgs.listForAuthenticatedUser({
          per_page,
          page,
        }),
        true,
      );
    }
  }
}
