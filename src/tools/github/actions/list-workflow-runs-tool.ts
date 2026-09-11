import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

// Valid status values for workflow runs
const statusEnum = z.enum([
  'completed',
  'action_required',
  'cancelled',
  'failure',
  'neutral',
  'skipped',
  'stale',
  'success',
  'timed_out',
  'in_progress',
  'queued',
  'requested',
  'waiting',
  'pending',
]);

/**
 * Schema definition for the List Github Workflow Runs tool parameters
 */
export const GithubActionsListWorkflowRunsSchema = createGithubBaseSchema({
  branch: z.string().optional().describe('Returns workflow runs associated with a branch'),
  status: statusEnum.optional().describe('Returns workflow runs with the check run status'),
  workflow_id: z
    .string()
    .describe('The ID or file name of the workflow. For example, "main.yaml".'),
});

/**
 * Type for the List Github Workflow Runs tool parameters
 */
export type GithubActionsListWorkflowRunsToolParams = z.infer<
  typeof GithubActionsListWorkflowRunsSchema
>;

/**
 * List Github Workflow Runs - Lists all workflow runs for a repository
 */
@Tool({
  id: 'github-actions-list-workflow-runs',
  name: 'listGithubWorkflowRuns',
  description: 'Lists all workflow runs for a repository',
  category: 'Github: Actions',
  parameters: GithubActionsListWorkflowRunsSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'List Github Workflow Runs',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubActionsListWorkflowRunsTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsListWorkflowRunsToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsListWorkflowRunsSchema, args);

    return this.cleanResponse(
      await this.getClient().rest.actions.listWorkflowRuns(apiParams),
      true,
    );
  }
}
