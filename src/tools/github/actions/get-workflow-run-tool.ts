import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Workflow Run tool parameters
 */
export const GithubActionsGetWorkflowRunSchema = createGithubBaseSchema({
  run_id: z.number().int().positive().describe('The unique identifier of the workflow run'),
});

/**
 * Type for the Get Github Workflow Run tool parameters
 */
export type GithubActionsGetWorkflowRunToolParams = z.infer<
  typeof GithubActionsGetWorkflowRunSchema
>;

/**
 * Get Github Workflow Run - Gets a specific workflow run
 */
@Tool({
  id: 'github-actions-get-workflow-run',
  name: 'getGithubWorkflowRun',
  description: 'Gets a specific workflow run by ID',
  category: 'Github: Actions',
  parameters: GithubActionsGetWorkflowRunSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Workflow Run',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubActionsGetWorkflowRunTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsGetWorkflowRunToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsGetWorkflowRunSchema, args);

    return this.cleanResponse(await this.getClient().rest.actions.getWorkflowRun(apiParams));
  }
}
