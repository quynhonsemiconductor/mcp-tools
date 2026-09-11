import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Create Github Workflow Dispatch tool parameters
 */
export const GithubActionsCreateDispatchSchema = createGithubBaseSchema({
  workflow_id: z
    .string()
    .describe('The ID or file name of the workflow. For example, "main.yaml".'),
  ref: z
    .string()
    .default('main')
    .describe('The git reference for the workflow. The reference can be a branch or tag name.'),
  inputs: z
    .record(z.string(), z.string())
    .optional()
    .describe('Input keys and values configured in the workflow file.'),
});

/**
 * Type for the Create Github Workflow Dispatch tool parameters
 */
export type GithubActionsCreateDispatchToolParams = z.input<
  typeof GithubActionsCreateDispatchSchema
>;

/**
 * Create Github Workflow Dispatch - Manually trigger a GitHub Actions workflow run
 */
@Tool({
  id: 'github-actions-create-dispatch',
  name: 'createGithubWorkflowDispatch',
  description: 'Manually trigger a GitHub Actions workflow run',
  category: 'Github: Actions',
  parameters: GithubActionsCreateDispatchSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Create Github Workflow Dispatch',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubActionsCreateDispatchTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubActionsCreateDispatchToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubActionsCreateDispatchSchema, args);

    const response = await this.getClient().rest.actions.createWorkflowDispatch(apiParams);

    // Return a formatted response message since the API response is empty (204 No Content)
    return this.cleanResponse({
      status: response.status,
      message: 'Workflow dispatch created successfully.',
    });
  }
}
