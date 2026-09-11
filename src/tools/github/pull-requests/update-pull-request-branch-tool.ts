import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Update Github Pull Request Branch tool parameters
 */
export const GithubPullRequestUpdateBranchSchema = createGithubBaseSchema({
  pull_number: z.number().int().min(1).describe('Pull request number'),
  expected_head_sha: z
    .string()
    .optional()
    .describe("The expected SHA of the pull request's HEAD ref"),
});

/**
 * Type for the Update Github Pull Request Branch tool parameters
 */
export type GithubPullRequestUpdateBranchToolParams = z.infer<
  typeof GithubPullRequestUpdateBranchSchema
>;

/**
 * Update Github Pull Request Branch - Updates a pull request branch with latest changes from the base branch
 */
@Tool({
  id: 'github-pulls-update-branch',
  name: 'updateGithubPullRequestBranch',
  description: 'Updates a pull request branch with the latest changes from the base branch',
  category: 'Github: Pulls',
  parameters: GithubPullRequestUpdateBranchSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Update Github Pull Request Branch',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubPullRequestUpdateBranchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubPullRequestUpdateBranchToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubPullRequestUpdateBranchSchema, args);

    return this.cleanResponse(await this.getClient().rest.pulls.updateBranch(apiParams));
  }
}
