import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Merge Github Pull Request tool parameters
 */
export const GithubPullRequestMergeSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
  commit_title: z.string().optional().describe('Title for the merge commit'),
  commit_message: z.string().optional().describe('Message for the merge commit'),
  merge_method: z.enum(['merge', 'squash', 'rebase']).optional().describe('Merge method to use'),
});

/**
 * Type for the Merge Github Pull Request tool parameters
 */
export type GithubPullRequestMergeToolParams = z.infer<typeof GithubPullRequestMergeSchema>;

/**
 * Merge Github Pull Request - Merges a pull request
 */
@Tool({
  id: 'github-pulls-merge',
  name: 'mergeGithubPullRequest',
  description: 'Merges a pull request',
  category: 'Github: Pulls',
  parameters: GithubPullRequestMergeSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Merge Github Pull Request',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubPullRequestMergeTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestMergeToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestMergeSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.merge(apiParams));
  }
}
