import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for gist file update content
 */
const GistFileUpdateSchema = z.object({
  content: z.string().optional().describe('The new content of the file'),
  filename: z.string().optional().describe('The new filename for the file'),
});

/**
 * Schema definition for the Update Github Gist tool parameters
 */
export const GithubGistUpdateSchema = z.object({
  gist_id: z.string().describe('The unique identifier of the gist'),
  description: z.string().optional().describe('New description of the gist'),
  files: z
    .record(z.string(), GistFileUpdateSchema.or(z.null()))
    .optional()
    .describe(
      'Files to update. Use null to delete a file, or provide content/filename to update. Key is the current filename.',
    ),
});

/**
 * Type for the Update Github Gist tool parameters
 */
export type GithubGistUpdateToolParams = z.infer<typeof GithubGistUpdateSchema>;

/**
 * Update Github Gist - Updates an existing gist
 */
@Tool({
  id: 'github-gist-update',
  name: 'updateGithubGist',
  description: 'Updates an existing gist',
  category: 'Github: Gists',
  parameters: GithubGistUpdateSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update Github Gist',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubGistUpdateTool extends GithubBaseTool {
  /**
   * Execute the Update Github Gist tool
   */
  @CatchErrors()
  async execute(args: GithubGistUpdateToolParams): Promise<string> {
    const validatedArgs = GithubGistUpdateSchema.parse(args);

    // Transform files object to the format expected by GitHub API
    let files: Record<string, { content?: string; filename?: string } | null> | undefined;

    if (validatedArgs.files) {
      files = {};
      for (const [filename, fileData] of Object.entries(validatedArgs.files)) {
        if (fileData === null) {
          // Delete the file
          files[filename] = null;
        } else {
          files[filename] = {
            content: fileData.content,
            filename: fileData.filename,
          };
        }
      }
    }

    const response = await this.getClient().rest.gists.update({
      gist_id: validatedArgs.gist_id,
      description: validatedArgs.description,
      files: files as any,
    });

    return this.cleanResponse(response);
  }
}
