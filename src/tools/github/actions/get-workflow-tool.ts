import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Workflow tool parameters
 */
export const GithubActionsGetWorkflowSchema = createGithubBaseSchema({
  workflow_id: z
    .string()
    .describe('The ID or file name of the workflow. For example, "main.yaml".'),
});

/**
 * Type for the Get Github Workflow tool parameters
 */
export type GithubActionsGetWorkflowToolParams = z.infer<typeof GithubActionsGetWorkflowSchema>;

/**
 * Get Github Workflow - Gets a specific workflow in a repository
 */
@Tool({
  id: 'github-actions-get-workflow',
  name: 'getGithubWorkflow',
  description: 'Gets a specific workflow in a repository by ID or file name',
  category: 'Github: Actions',
  parameters: GithubActionsGetWorkflowSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Workflow',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubActionsGetWorkflowTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsGetWorkflowToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsGetWorkflowSchema, args);

    return this.cleanResponse(await this.getClient().rest.actions.getWorkflow(apiParams));
  }
}
