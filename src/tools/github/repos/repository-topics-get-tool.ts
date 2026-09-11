import { z } from 'zod';
import { Tool } from '../../../registry';
import { CatchErrors } from '../../../utils/tools';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the getGithubRepositoryTopics tool parameters
 */
export const GithubRepositoryTopicsGetToolSchema = createGithubBaseSchema();

/**
 * Type for the getGithubRepositoryTopics tool parameters
 */
export type GithubRepositoryTopicsGetToolParams = z.infer<
  typeof GithubRepositoryTopicsGetToolSchema
>;

/**
 * getGithubRepositoryTopics - Gets topics for a specific repository
 */
@Tool({
  id: 'github-repository-topics-get',
  name: 'getGithubRepositoryTopics',
  description: 'Gets topics for a specific repository',
  category: 'Github: Repos',
  parameters: GithubRepositoryTopicsGetToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get Github Repository Topics',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubRepositoryTopicsGetTool extends GithubBaseTool {
  /**
   * Execute the tool to get repository topics
   */
  @CatchErrors()
  async execute(args: GithubRepositoryTopicsGetToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubRepositoryTopicsGetToolSchema, args);

    const response = await this.getClient().rest.repos.getAllTopics({
      owner: apiParams.owner,
      repo: apiParams.repo,
    });
    // Force TypeScript to accept this as string
    return this.cleanResponse(response) as unknown as string;
  }
}
