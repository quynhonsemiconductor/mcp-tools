import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the List Github Workflows tool parameters
 */
export const GithubActionsListWorkflowsSchema = createGithubBaseSchema({});

/**
 * Type for the List Github Workflows tool parameters
 */
export type GithubActionsListWorkflowsToolParams = z.infer<typeof GithubActionsListWorkflowsSchema>;

/**
 * List Github Workflows - Lists the workflows in a repository
 */
@Tool({
  id: 'github-actions-list-workflows',
  name: 'listGithubWorkflows',
  description: 'Lists the workflows in a repository',
  category: 'Github: Actions',
  parameters: GithubActionsListWorkflowsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'List Github Workflows',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubActionsListWorkflowsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsListWorkflowsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsListWorkflowsSchema, args);

    return this.cleanResponse(
      await this.getClient().rest.actions.listRepoWorkflows(apiParams),
      true,
    );
  }
}
