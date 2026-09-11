import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the List Github Branches tool parameters
 */
export const GithubListBranchesSchema = createGithubBaseSchema({});

/**
 * Type for the List Github Branches tool parameters
 */
export type GithubListBranchesToolParams = z.infer<typeof GithubListBranchesSchema>;

/**
 * List Github Branches - Gets a list of branches for a repository
 */
@Tool({
  id: 'github-list-branches',
  name: 'listGithubBranches',
  description: 'Lists branches for a GitHub repository',
  category: 'Github: Branches',
  parameters: GithubListBranchesSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'List Github Branches',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubListBranchesTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubListBranchesToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubListBranchesSchema, args);

    return this.cleanResponse(await this.getClient().rest.repos.listBranches(apiParams), true);
  }
}
