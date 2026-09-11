import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Release Reaction tool parameters
 */
export const GithubDeleteReleaseReactionSchema = z.object({
  owner: z.string().describe('The account owner of the repository'),
  repo: z.string().describe('The name of the repository'),
  release_id: z.number().describe('The unique identifier of the release'),
  reaction_id: z.number().describe('The unique identifier of the reaction'),
});

/**
 * Type for the Delete Release Reaction tool parameters
 */
export type GithubDeleteReleaseReactionToolParams = z.infer<
  typeof GithubDeleteReleaseReactionSchema
>;

/**
 * Delete Release Reaction - Deletes a reaction to a release
 */
@Tool({
  id: 'github-delete-release-reaction',
  name: 'deleteGithubReleaseReaction',
  description: 'Deletes a reaction to a release',
  category: 'Github: Discussions',
  parameters: GithubDeleteReleaseReactionSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Release Reaction',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubDeleteReleaseReactionTool extends GithubBaseTool {
  /**
   * Execute the Delete Release Reaction tool
   */
  @CatchErrors()
  async execute(args: GithubDeleteReleaseReactionToolParams): Promise<string> {
    const validatedArgs = GithubDeleteReleaseReactionSchema.parse(args);

    const response = await this.getClient().rest.reactions.deleteForRelease({
      owner: validatedArgs.owner,
      repo: validatedArgs.repo,
      release_id: validatedArgs.release_id,
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
