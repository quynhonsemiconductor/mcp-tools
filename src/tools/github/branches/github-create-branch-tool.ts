import { z } from 'zod';
import { CatchErrors } from '../../../utils';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the createGithubBranch tool parameters
 */
export const GithubCreateBranchToolSchema = createGithubBaseSchema({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  ref: z.string().describe('The Git reference for the new branch (e.g., "refs/heads/branch-name")'),
  sha: z.string().describe('The commit SHA to create the branch from'),
});

/**
 * Type for the createGithubBranch tool parameters
 */
export type GithubCreateBranchToolParams = z.infer<typeof GithubCreateBranchToolSchema>;

/**
 * createGithubBranch - Creates a new branch in github repo
 */
@Tool({
  id: 'github-create-branch',
  name: 'createGithubBranch',
  description: 'Creates a new branch in github repo',
  category: 'Github: Branches',
  parameters: GithubCreateBranchToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Creates Github Branch',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubCreateBranchTool extends GithubBaseTool {
  /**
   * Execute the tool
   */
  @CatchErrors()
  async execute(args: GithubCreateBranchToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubCreateBranchToolSchema, args);

    return this.cleanResponse(await this.getClient().rest.git.createRef(apiParams));
  }
}
