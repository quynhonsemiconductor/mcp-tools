import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the List Github Workflow Run Jobs tool parameters
 */
export const GithubActionsListWorkflowRunJobsSchema = createGithubBaseSchema({
  run_id: z.number().int().positive().describe('The unique identifier of the workflow run'),
});

/**
 * Type for the List Github Workflow Run Jobs tool parameters
 */
export type GithubActionsListWorkflowRunJobsToolParams = z.infer<
  typeof GithubActionsListWorkflowRunJobsSchema
>;

/**
 * List Github Workflow Run Jobs - Lists jobs for a workflow run
 */
@Tool({
  id: 'github-actions-list-workflow-run-jobs',
  name: 'listGithubWorkflowRunJobs',
  description: 'Lists jobs for a workflow run',
  category: 'Github: Actions',
  parameters: GithubActionsListWorkflowRunJobsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'List Github Workflow Run Jobs',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubActionsListWorkflowRunJobsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsListWorkflowRunJobsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsListWorkflowRunJobsSchema, args);

    return this.cleanResponse(
      await this.getClient().rest.actions.listJobsForWorkflowRun(apiParams),
      true,
    );
  }
}
