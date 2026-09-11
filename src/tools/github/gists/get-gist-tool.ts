import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';

/**
 * Schema definition for the Get Github Gist tool parameters
 */
export const GithubGistGetSchema = z.object({
  gist_id: z.string().describe('The unique identifier of the gist'),
});

/**
 * Type for the Get Github Gist tool parameters
 */
export type GithubGistGetToolParams = z.infer<typeof GithubGistGetSchema>;

/**
 * Minimal shape of a single file entry in a GitHub gist response.
 * Only the fields this tool reads/mutates are declared.
 */
interface GistFile {
  encoding?: string;
  content?: string;
  [key: string]: unknown;
}

/**
 * Minimal shape of the GitHub gist response this tool reads.
 */
interface GistResponse {
  files?: Record<string, GistFile>;
  [key: string]: unknown;
}

/**
 * Get Github Gist - Gets a specific gist by ID with full content
 */
@Tool({
  id: 'github-gist-get',
  name: 'getGithubGist',
  description: 'Gets a specific gist by ID with full content',
  category: 'Github: Gists',
  parameters: GithubGistGetSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get Github Gist',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubGistGetTool extends GithubBaseTool {
  /**
   * Execute the Get Github Gist tool
   */
  @CatchErrors()
  async execute(args: GithubGistGetToolParams): Promise<string> {
    const validatedArgs = GithubGistGetSchema.parse(args);

    const response = await this.getClient().rest.gists.get({
      gist_id: validatedArgs.gist_id,
    });

    const json = JSON.parse(this.cleanResponse(response)) as GistResponse;

    // Decode base64 content if present (similar to repository content tool)
    if (json.files) {
      for (const file of Object.values(json.files)) {
        if (file.encoding === 'base64' && typeof file.content === 'string') {
          file.content = Buffer.from(file.content, 'base64').toString('utf-8');
          file.encoding = 'utf-8';
        }
      }
    }

    return JSON.stringify(json);
  }
}
