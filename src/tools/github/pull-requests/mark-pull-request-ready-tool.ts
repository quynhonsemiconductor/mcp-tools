import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Mark Pull Request Ready tool parameters
 */
export const GithubPullRequestMarkReadySchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
});

/**
 * Type for the Mark Pull Request Ready tool parameters
 */
export type GithubPullRequestMarkReadyToolParams = z.infer<typeof GithubPullRequestMarkReadySchema>;

/**
 * Interface for the GraphQL mutation response
 */
interface MarkReadyResponse {
  markPullRequestReadyForReview: {
    pullRequest: {
      number: number;
      title: string;
    };
  };
}

/**
 * Mark Pull Request Ready - Marks a draft pull request as ready for review
 */
@Tool({
  id: 'github-pulls-mark-ready',
  name: 'markGithubPullRequestReady',
  description: 'Marks a draft pull request as ready for review',
  category: 'Github: Pulls',
  parameters: GithubPullRequestMarkReadySchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Mark Github Pull Request Ready',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubPullRequestMarkReadyTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestMarkReadyToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestMarkReadySchema, args);

    const client = this.getClient();

    // Get the PR's node_id (required for GraphQL mutation)
    const { data: pr } = await client.rest.pulls.get(apiParams);

    const response = await client.graphql<MarkReadyResponse>(
      `mutation MarkReady($pullRequestId: ID!) {
        markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
          pullRequest {
            number
            title
          }
        }
      }`,
      { pullRequestId: pr.node_id },
    );

    return this.cleanResponse({
      data: response.markPullRequestReadyForReview.pullRequest,
    });
  }
}
