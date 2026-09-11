import { z } from 'zod';
import { Tool } from '../../../registry';
import { CatchErrors } from '../../../utils/tools';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the updateGithubRepositoryTopics tool parameters
 */
export const GithubRepositoryTopicsUpdateToolSchema = createGithubBaseSchema({
  topics: z.array(z.string()).describe('Array of repository topics'),
  operation: z
    .enum(['replace', 'add', 'remove'])
    .default('replace')
    .describe(
      'Operation to perform: replace all topics, add new topics, or remove specified topics',
    ),
});

/**
 * Type for the updateGithubRepositoryTopics tool parameters
 */
export type GithubRepositoryTopicsUpdateToolParams = z.infer<
  typeof GithubRepositoryTopicsUpdateToolSchema
>;

/**
 * updateGithubRepositoryTopics - Updates topics for a repository (add/remove/replace)
 */
@Tool({
  id: 'github-repository-topics-update',
  name: 'updateGithubRepositoryTopics',
  description: 'Updates topics for a repository (add/remove/replace)',
  category: 'Github: Repos',
  parameters: GithubRepositoryTopicsUpdateToolSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Update Github Repository Topics',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubRepositoryTopicsUpdateTool extends GithubBaseTool {
  /**
   * Execute the tool to update repository topics
   */
  @CatchErrors()
  async execute(args: GithubRepositoryTopicsUpdateToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubRepositoryTopicsUpdateToolSchema, args);
    const { topics, operation } = args;

    // For add or remove operations, we need to get current topics first
    if (operation === 'add' || operation === 'remove') {
      const currentTopicsResponse = await this.getClient().rest.repos.getAllTopics({
        owner: apiParams.owner,
        repo: apiParams.repo,
      });

      const currentTopics = currentTopicsResponse.data.names || [];

      let updatedTopics: string[];

      if (operation === 'add') {
        // Add new topics without duplicates
        updatedTopics = Array.from(new Set([...currentTopics, ...topics]));
      } else {
        // remove
        // Remove specified topics
        updatedTopics = currentTopics.filter((topic) => !topics.includes(topic));
      }

      // Update with the modified topics list
      const response = await this.getClient().rest.repos.replaceAllTopics({
        owner: apiParams.owner,
        repo: apiParams.repo,
        names: updatedTopics,
      });

      // Force TypeScript to accept this as string
      return this.cleanResponse(response) as unknown as string;
    } else {
      // Default is replace - simply set the provided topics
      const response = await this.getClient().rest.repos.replaceAllTopics({
        owner: apiParams.owner,
        repo: apiParams.repo,
        names: topics,
      });

      // Force TypeScript to accept this as string
      return this.cleanResponse(response) as unknown as string;
    }
  }
}
