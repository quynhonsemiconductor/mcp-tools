import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Create Github Pull Request tool parameters
 */
export const GithubPullRequestCreateSchema = createGithubBaseSchema({
  title: z.string().min(1).describe('The title of the pull request'),
  head: z.string().min(1).describe('The name of the branch where your changes are implemented'),
  base: z
    .string()
    .min(1)
    .default('main')
    .describe('The name of the branch you want the changes pulled into'),
  body: z.string().optional().describe('The contents of the pull request'),
  draft: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether to create the pull request as a draft'),
  maintainer_can_modify: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether maintainers can modify the pull request'),
});

/**
 * Type for the Create Github Pull Request tool parameters
 */
export type GithubPullRequestCreateToolParams = z.input<typeof GithubPullRequestCreateSchema>;

/**
 * Create Github Pull Request - Creates a new pull request in a repository
 */
@Tool({
  id: 'github-pulls-create',
  name: 'createGithubPullRequest',
  description: 'Creates a new pull request in a repository',
  category: 'Github: Pulls',
  parameters: GithubPullRequestCreateSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'Create Github Pull Request',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubPullRequestCreateTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestCreateToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestCreateSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.create(apiParams));
  }
}
