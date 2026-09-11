import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Remove Github Pull Request Reviewers tool parameters
 */
export const GithubPullRequestRemoveReviewersSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('The pull request number'),
  reviewers: z
    .array(z.string())
    .optional()
    .describe('An array of user login names to remove from review requests'),
  team_reviewers: z
    .array(z.string())
    .optional()
    .describe('An array of team slugs to remove from review requests'),
});

/**
 * Type for the Remove Github Pull Request Reviewers tool parameters
 */
export type GithubPullRequestRemoveReviewersToolParams = z.infer<
  typeof GithubPullRequestRemoveReviewersSchema
>;

/**
 * Remove Github Pull Request Reviewers - Removes reviewers from a pull request
 */
@Tool({
  id: 'github-pulls-remove-reviewers',
  name: 'removeGithubPullRequestReviewers',
  description: 'Removes reviewers from a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestRemoveReviewersSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.0',
  annotations: {
    title: 'Remove Github Pull Request Reviewers',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubPullRequestRemoveReviewersTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestRemoveReviewersToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestRemoveReviewersSchema, args);

    if (!apiParams.reviewers && !apiParams.team_reviewers) {
      throw new Error('At least one reviewer or team reviewer must be specified');
    }

    const client = this.getClient();
    type RemoveReviewersParams = Parameters<
      typeof client.rest.pulls.removeRequestedReviewers
    >[0];

    // Build the request parameters. `reviewers`/`team_reviewers` are only
    // included when non-empty; the guard above guarantees at least one is set.
    const requestParams: {
      owner: string;
      repo: string;
      pull_number: number;
      reviewers?: string[];
      team_reviewers?: string[];
    } = {
      owner: apiParams.owner,
      repo: apiParams.repo,
      pull_number: apiParams.pull_number,
    };

    if (apiParams.reviewers && apiParams.reviewers.length > 0) {
      requestParams.reviewers = apiParams.reviewers;
    }

    if (apiParams.team_reviewers && apiParams.team_reviewers.length > 0) {
      requestParams.team_reviewers = apiParams.team_reviewers;
    }

    const result = await client.rest.pulls.removeRequestedReviewers(
      requestParams as RemoveReviewersParams,
    );

    return this.cleanResponse(result);
  }
}
