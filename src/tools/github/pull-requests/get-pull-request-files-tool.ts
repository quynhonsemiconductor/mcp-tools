import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Pull Request Files tool parameters
 */
export const GithubPullRequestFilesSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
  per_page: z.number().int().min(1).max(100).default(30).describe('Results per page'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the Get Github Pull Request Files tool parameters
 */
export type GithubPullRequestFilesToolParams = z.input<typeof GithubPullRequestFilesSchema>;

/**
 * Get Github Pull Request Files - Gets the list of files changed in a pull request
 */
@Tool({
  id: 'github-pulls-get-files',
  name: 'getGithubPullRequestFiles',
  description: 'Gets the list of files changed in a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestFilesSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.1.0',
  annotations: {
    title: 'Get Github Pull Request Files',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubPullRequestFilesTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestFilesToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestFilesSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.listFiles(apiParams));
  }
}
