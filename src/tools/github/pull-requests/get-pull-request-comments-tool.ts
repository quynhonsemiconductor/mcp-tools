import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Pull Request Comments tool parameters
 */
export const GithubPullRequestCommentsSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the Get Github Pull Request Comments tool parameters
 */
export type GithubPullRequestCommentsToolParams = z.infer<typeof GithubPullRequestCommentsSchema>;

/**
 * Get Github Pull Request Comments - Gets the comments on a pull request
 */
@Tool({
  id: 'github-pulls-get-comments',
  name: 'getGithubPullRequestComments',
  description: 'Gets the comments on a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestCommentsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Pull Request Comments',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubPullRequestCommentsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestCommentsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestCommentsSchema, args);

    return this.cleanResponse(
      await this.getClient().rest.pulls.listReviewComments(apiParams),
      true,
    );
  }
}
