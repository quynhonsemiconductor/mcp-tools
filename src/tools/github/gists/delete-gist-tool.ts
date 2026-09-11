import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Delete Github Gist tool parameters
 */
export const GithubGistDeleteSchema = z.object({
  gist_id: z.string().describe('The unique identifier of the gist'),
});

/**
 * Type for the Delete Github Gist tool parameters
 */
export type GithubGistDeleteToolParams = z.infer<typeof GithubGistDeleteSchema>;

/**
 * Delete Github Gist - Deletes a gist
 */
@Tool({
  id: 'github-gist-delete',
  name: 'deleteGithubGist',
  description: 'Deletes a gist',
  category: 'Github: Gists',
  parameters: GithubGistDeleteSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Delete Github Gist',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubGistDeleteTool extends GithubBaseTool {
  /**
   * Execute the Delete Github Gist tool
   */
  @CatchErrors()
  async execute(args: GithubGistDeleteToolParams): Promise<string> {
    const validatedArgs = GithubGistDeleteSchema.parse(args);

    const response = await this.getClient().rest.gists.delete({
      gist_id: validatedArgs.gist_id,
    });

    // Return a success message since delete returns 204 with no content
    return JSON.stringify({
      message: `Gist ${validatedArgs.gist_id} has been successfully deleted`,
      status: response.status,
    });
  }
}
