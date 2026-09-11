import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Add Github Pull Request Reviewers tool parameters
 */
export const GithubPullRequestAddReviewersSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('The pull request number'),
  reviewers: z
    .array(z.string())
    .optional()
    .describe('An array of user login names to request a review from'),
  team_reviewers: z
    .array(z.string())
    .optional()
    .describe('An array of team slugs to request a review from'),
});

/**
 * Type for the Add Github Pull Request Reviewers tool parameters
 */
export type GithubPullRequestAddReviewersToolParams = z.infer<
  typeof GithubPullRequestAddReviewersSchema
>;

/**
 * Add Github Pull Request Reviewers - Requests reviewers for a pull request
 */
@Tool({
  id: 'github-pulls-add-reviewers',
  name: 'addGithubPullRequestReviewers',
  description: 'Adds reviewers to a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestAddReviewersSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.0',
  annotations: {
    title: 'Add Github Pull Request Reviewers',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubPullRequestAddReviewersTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestAddReviewersToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestAddReviewersSchema, args);

    if (!apiParams.reviewers && !apiParams.team_reviewers) {
      throw new Error('At least one reviewer or team reviewer must be specified');
    }

    const result = await this.getClient().rest.pulls.requestReviewers(apiParams);

    return this.cleanResponse(result);
  }
}
