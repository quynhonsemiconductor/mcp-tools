import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Commit Comment Reaction tool parameters
 */
export const GithubDeleteCommitCommentReactionSchema = z.object({
  owner: z.string().describe('The account owner of the repository'),
  repo: z.string().describe('The name of the repository'),
  comment_id: z.number().describe('The unique identifier of the comment'),
  reaction_id: z.number().describe('The unique identifier of the reaction'),
});

/**
 * Type for the Delete Commit Comment Reaction tool parameters
 */
export type GithubDeleteCommitCommentReactionToolParams = z.infer<
  typeof GithubDeleteCommitCommentReactionSchema
>;

/**
 * Delete Commit Comment Reaction - Deletes a reaction to a commit comment
 */
@Tool({
  id: 'github-delete-commit-comment-reaction',
  name: 'deleteGithubCommitCommentReaction',
  description: 'Deletes a reaction to a commit comment',
  category: 'Github: Discussions',
  parameters: GithubDeleteCommitCommentReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Commit Comment Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubDeleteCommitCommentReactionTool extends GithubBaseTool {
  /**
   * Execute the Delete Commit Comment Reaction tool
   */
  @CatchErrors()
  async execute(args: GithubDeleteCommitCommentReactionToolParams): Promise<string> {
    const validatedArgs = GithubDeleteCommitCommentReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.deleteForCommitComment({
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
