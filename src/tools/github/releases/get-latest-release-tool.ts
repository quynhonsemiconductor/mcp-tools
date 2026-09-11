import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Latest GitHub Release tool parameters
 */
export const GithubGetLatestReleaseSchema = createGithubBaseSchema();

/**
 * Type for the Get Latest GitHub Release tool parameters
 */
export type GithubGetLatestReleaseToolParams = z.infer<typeof GithubGetLatestReleaseSchema>;

/**
 * Get Latest GitHub Release - Gets the latest published release for a repository
 */
@Tool({
  id: 'github-get-latest-release',
  name: 'getLatestGithubRelease',
  description: 'Gets the latest published release for a GitHub repository',
  category: 'Github: Releases',
  parameters: GithubGetLatestReleaseSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get Latest GitHub Release',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubGetLatestReleaseTool extends GithubBaseTool {
  /**
   * Execute the get latest release tool
   */
  @CatchErrors()
  async execute(args: GithubGetLatestReleaseToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubGetLatestReleaseSchema, args);

    try {
      const response =
        // @ts-ignore
        await this.getClient().rest.repos.getLatestRelease(apiParams);
      return this.cleanResponse(response);
    } catch (error: any) {
      // Handle specific case when no releases exist
      if (error.status === 404) {
        return JSON.stringify(
          {
            message: `No releases found for ${args.org}/${args.repo}`,
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
