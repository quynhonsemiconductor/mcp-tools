import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Pull Request tool parameters
 */
export const GithubPullRequestGetSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('The pull request number'),
});

/**
 * Type for the Get Github Pull Request tool parameters
 */
export type GithubPullRequestGetToolParams = z.infer<typeof GithubPullRequestGetSchema>;

/**
 * Get Github Pull Request - Gets the contents of a pull request within a repository
 */
@Tool({
  id: 'github-pulls-get',
  name: 'getGithubPullRequest',
  description: 'Gets the details of a specific pull request within a repository',
  category: 'Github: Pulls',
  parameters: GithubPullRequestGetSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'Get Github Pull Request',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubPullRequestGetTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestGetToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestGetSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.get(apiParams));
  }
}
