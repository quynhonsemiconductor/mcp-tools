import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Merge Github Branch tool parameters
 */
export const GithubMergeBranchSchema = createGithubBaseSchema({
  base: z.string().describe('The name of the base branch that the head will be merged into'),
  head: z.string().describe('The head to merge. This can be a branch name or a commit SHA1'),
  commit_message: z
    .string()
    .optional()
    .describe(
      'Commit message to use for the merge commit. If omitted, a default message will be used',
    ),
});

/**
 * Type for the Merge Github Branch tool parameters
 */
export type GithubMergeBranchToolParams = z.infer<typeof GithubMergeBranchSchema>;

/**
 * Merge Github Branch - Merges a branch in a repository
 */
@Tool({
  id: 'github-merge-branch',
  name: 'mergeGithubBranch',
  description: 'Merges a branch in a GitHub repository',
  category: 'Github: Branches',
  parameters: GithubMergeBranchSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'Merge Github Branch',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubMergeBranchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubMergeBranchToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubMergeBranchSchema, args);

    return this.cleanResponse(await this.getClient().rest.repos.merge(apiParams));
  }
}
