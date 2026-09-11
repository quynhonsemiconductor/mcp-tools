import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Pull Request Reviews tool parameters
 */
export const GithubPullRequestReviewsSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
  per_page: z.number().int().min(1).max(100).default(10).describe('Results per page'),
  page: z.number().int().min(1).optional().describe('Page number'),
});

/**
 * Type for the Get Github Pull Request Reviews tool parameters
 */
export type GithubPullRequestReviewsToolParams = z.infer<typeof GithubPullRequestReviewsSchema>;

/**
 * Get Github Pull Request Reviews - Gets the reviews on a pull request
 */
@Tool({
  id: 'github-pulls-get-reviews',
  name: 'getGithubPullRequestReviews',
  description: 'Gets the reviews on a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestReviewsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Pull Request Reviews',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubPullRequestReviewsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestReviewsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestReviewsSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.listReviews(apiParams), true);
  }
}
