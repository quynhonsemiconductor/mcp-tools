import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Team Discussion Comment Reaction tool parameters
 */
export const GithubDeleteTeamDiscussionCommentReactionSchema = z.object({
  org: z.string().describe('The organization name'),
  team_slug: z.string().describe('The slug of the team name'),
  discussion_number: z.number().describe('The number that identifies the discussion'),
  comment_number: z.number().describe('The number that identifies the comment'),
  reaction_id: z.number().describe('The unique identifier of the reaction'),
});

/**
 * Type for the Delete Team Discussion Comment Reaction tool parameters
 */
export type GithubDeleteTeamDiscussionCommentReactionToolParams = z.infer<
  typeof GithubDeleteTeamDiscussionCommentReactionSchema
>;

/**
 * Delete Team Discussion Comment Reaction - Deletes a reaction to a team discussion comment
 */
@Tool({
  id: 'github-delete-team-discussion-comment-reaction',
  name: 'deleteGithubTeamDiscussionCommentReaction',
  description: 'Deletes a reaction to a team discussion comment',
  category: 'Github: Discussions',
  parameters: GithubDeleteTeamDiscussionCommentReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Team Discussion Comment Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubDeleteTeamDiscussionCommentReactionTool extends GithubBaseTool {
  /**
   * Execute the Delete Team Discussion Comment Reaction tool
   */
  @CatchErrors()
  async execute(args: GithubDeleteTeamDiscussionCommentReactionToolParams): Promise<string> {
    const validatedArgs = GithubDeleteTeamDiscussionCommentReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.deleteForTeamDiscussionComment({
      org: validatedArgs.org,
      team_slug: validatedArgs.team_slug,
      discussion_number: validatedArgs.discussion_number,
      comment_number: validatedArgs.comment_number,
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
