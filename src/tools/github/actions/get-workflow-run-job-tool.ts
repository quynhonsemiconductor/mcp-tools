import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Workflow Run Job tool parameters
 */
export const GithubActionsGetWorkflowRunJobSchema = createGithubBaseSchema({
  job_id: z.number().int().positive().describe('The unique identifier of the job'),
});

/**
 * Type for the Get Github Workflow Run Job tool parameters
 */
export type GithubActionsGetWorkflowRunJobToolParams = z.infer<
  typeof GithubActionsGetWorkflowRunJobSchema
>;

/**
 * Get Github Workflow Run Job - Gets a specific job in a workflow run
 */
@Tool({
  id: 'github-actions-get-workflow-run-job',
  name: 'getGithubWorkflowRunJob',
  description: 'Gets a specific job in a workflow run by ID',
  category: 'Github: Actions',
  parameters: GithubActionsGetWorkflowRunJobSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Get Github Workflow Run Job',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubActionsGetWorkflowRunJobTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsGetWorkflowRunJobToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsGetWorkflowRunJobSchema, args);

    return this.cleanResponse(await this.getClient().rest.actions.getJobForWorkflowRun(apiParams));
  }
}
