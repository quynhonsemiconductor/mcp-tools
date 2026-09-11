import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Issue Reaction tool parameters
 */
export const GithubDeleteIssueReactionSchema = z.object({
  owner: z.string().describe('The account owner of the repository'),
  repo: z.string().describe('The name of the repository'),
  issue_number: z.number().describe('The number that identifies the issue'),
  reaction_id: z.number().describe('The unique identifier of the reaction'),
});

/**
 * Type for the Delete Issue Reaction tool parameters
 */
export type GithubDeleteIssueReactionToolParams = z.infer<typeof GithubDeleteIssueReactionSchema>;

/**
 * Delete Issue Reaction - Deletes a reaction to an issue
 */
@Tool({
  id: 'github-delete-issue-reaction',
  name: 'deleteGithubIssueReaction',
  description: 'Deletes a reaction to an issue',
  category: 'Github: Discussions',
  parameters: GithubDeleteIssueReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Issue Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubDeleteIssueReactionTool extends GithubBaseTool {
  /**
   * Execute the Delete Issue Reaction tool
   */
  @CatchErrors()
  async execute(args: GithubDeleteIssueReactionToolParams): Promise<string> {
    const validatedArgs = GithubDeleteIssueReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.deleteForIssue({
      owner: validatedArgs.owner,
      repo: validatedArgs.repo,
      issue_number: validatedArgs.issue_number,
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
