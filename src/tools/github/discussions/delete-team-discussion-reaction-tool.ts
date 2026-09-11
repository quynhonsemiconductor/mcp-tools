import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Team Discussion Reaction tool parameters
 */
export const GithubDeleteTeamDiscussionReactionSchema = z.object({
  org: z.string().describe('The organization name'),
  team_slug: z.string().describe('The slug of the team name'),
  discussion_number: z.number().describe('The number that identifies the discussion'),
  reaction_id: z.number().describe('The unique identifier of the reaction'),
});

/**
 * Type for the Delete Team Discussion Reaction tool parameters
 */
export type GithubDeleteTeamDiscussionReactionToolParams = z.infer<
  typeof GithubDeleteTeamDiscussionReactionSchema
>;

/**
 * Delete Team Discussion Reaction - Deletes a reaction to a team discussion
 */
@Tool({
  id: 'github-delete-team-discussion-reaction',
  name: 'deleteGithubTeamDiscussionReaction',
  description: 'Deletes a reaction to a team discussion',
  category: 'Github: Discussions',
  parameters: GithubDeleteTeamDiscussionReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Team Discussion Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubDeleteTeamDiscussionReactionTool extends GithubBaseTool {
  /**
   * Execute the Delete Team Discussion Reaction tool
   */
  @CatchErrors()
  async execute(args: GithubDeleteTeamDiscussionReactionToolParams): Promise<string> {
    const validatedArgs = GithubDeleteTeamDiscussionReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.deleteForTeamDiscussion({
      org: validatedArgs.org,
      team_slug: validatedArgs.team_slug,
      discussion_number: validatedArgs.discussion_number,
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
