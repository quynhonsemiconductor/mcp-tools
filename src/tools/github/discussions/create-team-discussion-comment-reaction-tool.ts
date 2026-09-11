import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Create Reaction for Team Discussion Comment tool parameters
 */
export const GithubCreateTeamDiscussionCommentReactionSchema = z.object({
  org: z.string().describe('The organization name'),
  team_slug: z.string().describe('The slug of the team name'),
  discussion_number: z.number().describe('The number that identifies the discussion'),
  comment_number: z.number().describe('The number that identifies the comment'),
  content: z
    .enum(['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'])
    .describe('The reaction type to add to the team discussion comment'),
});

/**
 * Type for the Create Reaction for Team Discussion Comment tool parameters
 */
export type GithubCreateTeamDiscussionCommentReactionToolParams = z.infer<
  typeof GithubCreateTeamDiscussionCommentReactionSchema
>;

/**
 * Create Reaction for Team Discussion Comment - Creates a reaction to a team discussion comment
 */
@Tool({
  id: 'github-create-team-discussion-comment-reaction',
  name: 'createGithubTeamDiscussionCommentReaction',
  description: 'Creates a reaction to a team discussion comment',
  category: 'Github: Discussions',
  parameters: GithubCreateTeamDiscussionCommentReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Create Github Team Discussion Comment Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubCreateTeamDiscussionCommentReactionTool extends GithubBaseTool {
  /**
   * Execute the Create Reaction for Team Discussion Comment tool
   */
  @CatchErrors()
  async execute(args: GithubCreateTeamDiscussionCommentReactionToolParams): Promise<string> {
    const validatedArgs = GithubCreateTeamDiscussionCommentReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.createForTeamDiscussionCommentInOrg({
      org: validatedArgs.org,
      team_slug: validatedArgs.team_slug,
      discussion_number: validatedArgs.discussion_number,
      comment_number: validatedArgs.comment_number,
      content: validatedArgs.content,
    });

    return this.cleanResponse(response);
  }
}
