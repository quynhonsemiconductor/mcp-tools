import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Workflow Run tool parameters
 */
export const GithubActionsGetWorkflowRunLogsSchema = createGithubBaseSchema({
  job_id: z.number().int().positive().describe('The unique identifier of the workflow run'),
  attempt_number: z.number().int().positive().describe('The unique identifier of the workflow run'),
});

/**
 * Type for the Get Github Workflow Run tool parameters
 */
export type GithubActionsGetWorkflowRunLogsToolParams = z.infer<
  typeof GithubActionsGetWorkflowRunLogsSchema
>;

/**
 * Get Github Workflow Run Log - Gets a specific workflow run
 */
@Tool({
  id: 'github-actions-get-workflow-run-logs',
  name: 'getGithubWorkflowRunLogs',
  description: 'Gets a log for a workflow run by ID',
  category: 'Github: Actions',
  parameters: GithubActionsGetWorkflowRunLogsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.0',
  annotations: {
    title: 'Get Github Workflow Run Logs',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubActionsGetWorkflowRunLogsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsGetWorkflowRunLogsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsGetWorkflowRunLogsSchema, args);

    return this.cleanResponse(
      await this.getClient().rest.actions.downloadJobLogsForWorkflowRun(apiParams),
    );
  }
}
