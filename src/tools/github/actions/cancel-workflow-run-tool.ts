import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Cancel Github Workflow Run tool parameters
 */
export const GithubActionsCancelWorkflowRunSchema = createGithubBaseSchema({
  run_id: z.number().int().positive().describe('The unique identifier of the workflow run'),
});

/**
 * Type for the Cancel Github Workflow Run tool parameters
 */
export type GithubActionsCancelWorkflowRunToolParams = z.infer<
  typeof GithubActionsCancelWorkflowRunSchema
>;

/**
 * Cancel Github Workflow Run - Cancels a workflow run
 */
@Tool({
  id: 'github-actions-cancel-workflow-run',
  name: 'cancelGithubWorkflowRun',
  description: 'Cancels a workflow run',
  category: 'Github: Actions',
  parameters: GithubActionsCancelWorkflowRunSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Cancel Github Workflow Run',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubActionsCancelWorkflowRunTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsCancelWorkflowRunToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsCancelWorkflowRunSchema, args);

    const response = await this.getClient().rest.actions.cancelWorkflowRun(apiParams);

    return this.cleanResponse({
      status: response.status,
      message: 'Workflow run cancellation request has been accepted.',
    });
  }
}
