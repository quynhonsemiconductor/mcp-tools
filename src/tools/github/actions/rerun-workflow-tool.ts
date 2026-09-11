import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Rerun Github Workflow Run tool parameters
 */
export const GithubActionsRerunWorkflowSchema = createGithubBaseSchema({
  run_id: z.number().int().positive().describe('The unique identifier of the workflow run'),
  enable_debug_logging: z.boolean().optional().describe('Enables debug logging'),
});

/**
 * Type for the Rerun Github Workflow Run tool parameters
 */
export type GithubActionsRerunWorkflowToolParams = z.infer<typeof GithubActionsRerunWorkflowSchema>;

/**
 * Rerun Github Workflow - Re-runs a workflow
 */
@Tool({
  id: 'github-actions-rerun-workflow',
  name: 'rerunGithubWorkflow',
  description: 'Re-runs a workflow by run ID',
  category: 'Github: Actions',
  parameters: GithubActionsRerunWorkflowSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Rerun Github Workflow',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubActionsRerunWorkflowTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsRerunWorkflowToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsRerunWorkflowSchema, args);

    // Debug logging is passed in the request body
    const requestBody: { enable_debug_logging?: boolean } = {};
    if (args.enable_debug_logging !== undefined) {
      requestBody.enable_debug_logging = args.enable_debug_logging;
    }

    const response = await this.getClient().rest.actions.reRunWorkflow({
      ...apiParams,
      ...requestBody,
    });

    return this.cleanResponse({
      status: response.status,
      message: 'Workflow run has been restarted.',
    });
  }
}
