import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Rename Github Branch tool parameters
 */
export const GithubRenameBranchSchema = createGithubBaseSchema({
  branch: z.string().describe('The name of the branch to rename'),
  new_name: z.string().describe('The new name of the branch'),
});

/**
 * Type for the Rename Github Branch tool parameters
 */
export type GithubRenameBranchToolParams = z.infer<typeof GithubRenameBranchSchema>;

/**
 * Rename Github Branch - Renames a branch in a repository
 */
@Tool({
  id: 'github-rename-branch',
  name: 'renameGithubBranch',
  description: 'Renames a branch in a GitHub repository',
  category: 'Github: Branches',
  parameters: GithubRenameBranchSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Rename Github Branch',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubRenameBranchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubRenameBranchToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubRenameBranchSchema, args);

    return this.cleanResponse(await this.getClient().rest.repos.renameBranch(apiParams));
  }
}
