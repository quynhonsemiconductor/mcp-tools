import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the List Github Organizations tool parameters
 */
export const GithubOrgsListSchema = z.object({
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  since: z
    .number()
    .int()
    .optional()
    .describe(
      'An organization ID. Only return organizations with an ID greater than this ID. Use the last organization ID from the previous page to paginate.',
    ),
});

/**
 * Type for the List Github Organizations tool parameters
 */
export type GithubOrgsListToolParams = z.input<typeof GithubOrgsListSchema>;

/**
 * List Github Organizations - Lists all organizations
 */
@Tool({
  id: 'github-orgs-list',
  name: 'listGithubOrganizations',
  description: 'Lists all organizations using cursor-based pagination',
  category: 'Github: Orgs',
  parameters: GithubOrgsListSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.2',
  annotations: {
    title: 'List Github Organizations',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubOrgsListTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubOrgsListToolParams): Promise<string> {
    return this.cleanResponse(await this.getClient().rest.orgs.list(args), false);
  }
}
