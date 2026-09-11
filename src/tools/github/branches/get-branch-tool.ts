import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Branch tool parameters
 */
export const GithubGetBranchSchema = createGithubBaseSchema({
  branch: z.string().describe('Branch name'),
});

/**
 * Type for the Get Github Branch tool parameters
 */
export type GithubGetBranchToolParams = z.infer<typeof GithubGetBranchSchema>;

/**
 * Get Github Branch - Gets a branch in a repository
 */
@Tool({
  id: 'github-get-branch',
  name: 'getGithubBranch',
  description: 'Gets a branch in a GitHub repository',
  category: 'Github: Branches',
  parameters: GithubGetBranchSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'Get Github Branch',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubGetBranchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubGetBranchToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubGetBranchSchema, args);

    return this.cleanResponse(await this.getClient().rest.repos.getBranch(apiParams));
  }
}
