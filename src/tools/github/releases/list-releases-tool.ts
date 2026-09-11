import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the List GitHub Releases tool parameters
 */
export const GithubListReleasesSchema = createGithubBaseSchema({
  page: z.number().min(1).optional().describe('Page number for pagination'),
  per_page: z.number().min(1).max(100).optional().describe('Number of results per page (max 100)'),
});

/**
 * Type for the List GitHub Releases tool parameters
 */
export type GithubListReleasesToolParams = z.infer<typeof GithubListReleasesSchema>;

/**
 * List GitHub Releases - Gets a list of releases for a repository
 */
@Tool({
  id: 'github-list-releases',
  name: 'listGithubReleases',
  description: 'Gets a list of releases for a GitHub repository',
  category: 'Github: Releases',
  parameters: GithubListReleasesSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'List GitHub Releases',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubListReleasesTool extends GithubBaseTool {
  /**
   * Execute the list releases tool
   */
  @CatchErrors()
  async execute(args: GithubListReleasesToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubListReleasesSchema, args);

    try {
      const response = await this.getClient().rest.repos.listReleases(apiParams);
      return this.cleanResponse(response, true); // Enable pagination info
    } catch (error: any) {
      // Handle specific case when repository doesn't exist or is private
      if (error.status === 404) {
        return JSON.stringify(
          {
            message: `Repository ${args.org}/${args.repo} not found or no access`,
            error: 'Not Found',
          },
          null,
          2,
        );
      }
      throw error;
    }
  }
}
