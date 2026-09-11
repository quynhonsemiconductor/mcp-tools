import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for gist file content
 */
const GistFileSchema = z.object({
  filename: z.string().describe('The name of the file'),
  content: z.string().describe('The content of the file'),
});

/**
 * Schema definition for the Create Github Gist tool parameters
 */
export const GithubGistCreateSchema = z.object({
  description: z.string().optional().describe('Description of the gist'),
  files: z
    .record(z.string(), GistFileSchema)
    .refine((files) => Object.keys(files).length > 0, {
      message: 'At least one file must be provided',
    })
    .describe('Files to include in the gist. Key is the filename, value contains file content'),
  public: z.boolean().default(true).describe('Whether the gist should be public or private'),
});

/**
 * Type for the Create Github Gist tool parameters
 */
export type GithubGistCreateToolParams = z.input<typeof GithubGistCreateSchema>;

/**
 * Create Github Gist - Creates a new gist
 */
@Tool({
  id: 'github-gist-create',
  name: 'createGithubGist',
  description: 'Creates a new gist',
  category: 'Github: Gists',
  parameters: GithubGistCreateSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Create Github Gist',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubGistCreateTool extends GithubBaseTool {
  /**
   * Execute the Create Github Gist tool
   */
  @CatchErrors()
  async execute(args: GithubGistCreateToolParams): Promise<string> {
    const validatedArgs = GithubGistCreateSchema.parse(args);

    // Transform files object to the format expected by GitHub API
    const files: Record<string, { content: string }> = {};
    for (const [filename, fileData] of Object.entries(validatedArgs.files)) {
      files[filename] = {
        content: fileData.content,
      };
    }

    const response = await this.getClient().rest.gists.create({
      description: validatedArgs.description,
      files: files,
      public: validatedArgs.public,
    });

    return this.cleanResponse(response);
  }
}
