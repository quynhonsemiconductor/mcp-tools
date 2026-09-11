import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Repository tool parameters
 */
export const GithubRepositoryGetSchema = createGithubBaseSchema();

/**
 * Type for the Get Github Repository tool parameters
 */
export type GithubRepositoryGetToolParams = z.infer<typeof GithubRepositoryGetSchema>;

/**
 * Get Github Repository - Gets details for a specific repository
 */
@Tool({
  id: 'github-repository-get',
  name: 'getGithubRepository',
  description: 'Gets details for a specific repository',
  category: 'Github: Repos',
  parameters: GithubRepositoryGetSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Repository',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubRepositoryGetTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubRepositoryGetToolParams): Promise<string> {
    const apiParams = {
      ...parseAndTransformGitHubParams(GithubRepositoryGetSchema, args),
      repo: args.repo,
    };

    return this.cleanResponse(await this.getClient().rest.repos.get(apiParams));
  }
}
