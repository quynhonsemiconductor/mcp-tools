import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Issue Comment Reaction tool parameters
 */
export const GithubDeleteIssueCommentReactionSchema = z.object({
  owner: z.string().describe('The account owner of the repository'),
  repo: z.string().describe('The name of the repository'),
  comment_id: z.number().describe('The unique identifier of the comment'),
  reaction_id: z.number().describe('The unique identifier of the reaction'),
});

/**
 * Type for the Delete Issue Comment Reaction tool parameters
 */
export type GithubDeleteIssueCommentReactionToolParams = z.infer<
  typeof GithubDeleteIssueCommentReactionSchema
>;

/**
 * Delete Issue Comment Reaction - Deletes a reaction to an issue comment
 */
@Tool({
  id: 'github-delete-issue-comment-reaction',
  name: 'deleteGithubIssueCommentReaction',
  description: 'Deletes a reaction to an issue comment',
  category: 'Github: Discussions',
  parameters: GithubDeleteIssueCommentReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Issue Comment Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubDeleteIssueCommentReactionTool extends GithubBaseTool {
  /**
   * Execute the Delete Issue Comment Reaction tool
   */
  @CatchErrors()
  async execute(args: GithubDeleteIssueCommentReactionToolParams): Promise<string> {
    const validatedArgs = GithubDeleteIssueCommentReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.deleteForIssueComment({
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
