import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Pull Request Status tool parameters
 */
export const GithubPullRequestStatusSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
});

/**
 * Type for the Get Github Pull Request Status tool parameters
 */
export type GithubPullRequestStatusToolParams = z.infer<typeof GithubPullRequestStatusSchema>;

/**
 * Get Github Pull Request Status - Gets the combined status of all status checks for a pull request
 */
@Tool({
  id: 'github-pulls-get-status',
  name: 'getGithubPullRequestStatus',
  description: 'Gets the combined status of all status checks for a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestStatusSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'Get Github Pull Request Status',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubPullRequestStatusTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestStatusToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestStatusSchema, args);

    // First, get the pull request to get the head SHA
    const pullRequest = await this.getClient().rest.pulls.get(apiParams);
    const headSha = pullRequest.data.head.sha;

    // Then get the combined status using the SHA
    const statusParams = {
      owner: apiParams.owner,
      repo: apiParams.repo,
      ref: headSha,
    };

    const statusResult = await this.getClient().rest.repos.getCombinedStatusForRef(statusParams);
    return this.cleanResponse(statusResult);
  }
}
