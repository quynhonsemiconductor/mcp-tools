import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Create Reaction for Team Discussion tool parameters
 */
export const GithubCreateTeamDiscussionReactionSchema = z.object({
  org: z.string().describe('The organization name'),
  team_slug: z.string().describe('The slug of the team name'),
  discussion_number: z.number().describe('The number that identifies the discussion'),
  content: z
    .enum(['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'])
    .describe('The reaction type to add to the team discussion'),
});

/**
 * Type for the Create Reaction for Team Discussion tool parameters
 */
export type GithubCreateTeamDiscussionReactionToolParams = z.infer<
  typeof GithubCreateTeamDiscussionReactionSchema
>;

/**
 * Create Reaction for Team Discussion - Creates a reaction to a team discussion
 */
@Tool({
  id: 'github-create-team-discussion-reaction',
  name: 'createGithubTeamDiscussionReaction',
  description: 'Creates a reaction to a team discussion',
  category: 'Github: Discussions',
  parameters: GithubCreateTeamDiscussionReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Create Github Team Discussion Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubCreateTeamDiscussionReactionTool extends GithubBaseTool {
  /**
   * Execute the Create Reaction for Team Discussion tool
   */
  @CatchErrors()
  async execute(args: GithubCreateTeamDiscussionReactionToolParams): Promise<string> {
    const validatedArgs = GithubCreateTeamDiscussionReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.createForTeamDiscussionInOrg({
      org: validatedArgs.org,
      team_slug: validatedArgs.team_slug,
      discussion_number: validatedArgs.discussion_number,
      content: validatedArgs.content,
    });

    return this.cleanResponse(response);
  }
}
