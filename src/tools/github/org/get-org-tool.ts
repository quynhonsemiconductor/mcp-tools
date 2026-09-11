import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Get Github Organization tool parameters
 */
export const GithubOrgGetSchema = z.object({
  org: z.string().min(1).describe('Organization name (required)'),
});

/**
 * Type for the Get Github Organization tool parameters
 */
export type GithubOrgGetToolParams = z.infer<typeof GithubOrgGetSchema>;

/**
 * Get Github Organization - Gets details for a specific organization
 */
@Tool({
  id: 'github-org-get',
  name: 'getGithubOrganization',
  description: 'Gets details for a specific organization',
  category: 'Github: Orgs',
  parameters: GithubOrgGetSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Organization',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubOrgGetTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubOrgGetToolParams): Promise<string> {
    return this.cleanResponse(await this.getClient().rest.orgs.get(args));
  }
}
