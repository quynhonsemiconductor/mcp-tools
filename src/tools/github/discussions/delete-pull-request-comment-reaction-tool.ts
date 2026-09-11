import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Pull Request Comment Reaction tool parameters
 */
export const GithubDeletePullRequestCommentReactionSchema = z.object({
  owner: z.string().describe('The account owner of the repository'),
  repo: z.string().describe('The name of the repository'),
  comment_id: z.number().describe('The unique identifier of the comment'),
  reaction_id: z.number().describe('The unique identifier of the reaction'),
});

/**
 * Type for the Delete Pull Request Comment Reaction tool parameters
 */
export type GithubDeletePullRequestCommentReactionToolParams = z.infer<
  typeof GithubDeletePullRequestCommentReactionSchema
>;

/**
 * Delete Pull Request Comment Reaction - Deletes a reaction to a pull request review comment
 */
@Tool({
  id: 'github-delete-pull-request-comment-reaction',
  name: 'deleteGithubPullRequestCommentReaction',
  description: 'Deletes a reaction to a pull request review comment',
  category: 'Github: Discussions',
  parameters: GithubDeletePullRequestCommentReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Pull Request Comment Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubDeletePullRequestCommentReactionTool extends GithubBaseTool {
  /**
   * Execute the Delete Pull Request Comment Reaction tool
   */
  @CatchErrors()
  async execute(args: GithubDeletePullRequestCommentReactionToolParams): Promise<string> {
    const validatedArgs = GithubDeletePullRequestCommentReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.deleteForPullRequestComment({
      owner: validatedArgs.owner,
      repo: validatedArgs.repo,
      comment_id: validatedArgs.comment_id,
      reaction_id: validatedArgs.reaction_id,
    });

    // For successful deletion, the API returns status 204 with no content
    if (response.status === 204) {
      return JSON.stringify({
        success: true,
        message: 'Reaction deleted successfully',
      });
    }

    return this.cleanResponse(response);
  }
}
