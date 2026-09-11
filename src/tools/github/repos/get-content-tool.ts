import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Repository Content tool parameters
 */
export const GithubRepositoryGetContentSchema = createGithubBaseSchema({
  path: z.string().describe('Path to the file or directory'),
  ref: z.string().optional().describe('Branch, tag, or commit SHA. Defaults to the default branch'),
});

/**
 * Type for the Get Github Repository Content tool parameters
 */
export type GithubRepositoryGetContentToolParams = z.infer<typeof GithubRepositoryGetContentSchema>;

/**
 * Minimal shape of a GitHub file-content response that this tool reads.
 * Directory responses are arrays and lack these fields, which is handled
 * by the `encoding === 'base64'` guard below.
 */
interface RepositoryFileContent {
  encoding?: string;
  content?: string;
  [key: string]: unknown;
}

/**
 * Get Github Repository Content - Gets the contents of a file or directory in a repository
 */
@Tool({
  id: 'github-repository-get-content',
  name: 'getGithubRepositoryContent',
  description: 'Gets the contents of a file or directory in a repository',
  category: 'Github: Repos',
  parameters: GithubRepositoryGetContentSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get Github Repository Content',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubRepositoryGetContentTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubRepositoryGetContentToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubRepositoryGetContentSchema, args);

    // Normalize root path: GHE returns HTTP 500 for path "/" but works with ""
    if (apiParams.path === '/') {
      apiParams.path = '';
    }

    const json = JSON.parse(
      this.cleanResponse(await this.getClient().rest.repos.getContent(apiParams)),
    ) as RepositoryFileContent | RepositoryFileContent[];

    if (!Array.isArray(json) && json.encoding === 'base64' && typeof json.content === 'string') {
      json.content = Buffer.from(json.content, 'base64').toString('utf-8');
      json.encoding = 'utf-8';
    }

    return JSON.stringify(json);
  }
}
