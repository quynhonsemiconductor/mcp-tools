import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Update Github Issue tool parameters
 */
export const GithubIssuesUpdateSchema = createGithubBaseSchema({
  issue_number: z.number().int().min(1).describe('Issue number to update'),
  title: z.string().optional().describe('New title'),
  body: z.string().optional().describe('New description'),
  state: z.enum(['open', 'closed']).optional().describe("New state ('open' or 'closed')"),
  labels: z.array(z.string()).optional().describe('New labels'),
  assignees: z.array(z.string()).optional().describe('New assignees'),
  milestone: z.number().int().optional().describe('New milestone number'),
});

/**
 * Type for the Update Github Issue tool parameters
 */
export type GithubIssuesUpdateToolParams = z.infer<typeof GithubIssuesUpdateSchema>;

/**
 * Update Github Issue - Updates an existing issue in a GitHub repository
 */
@Tool({
  id: 'github-issues-update',
  name: 'updateGithubIssue',
  description: 'Updates an existing issue in a GitHub repository',
  category: 'Github: Issues',
  parameters: GithubIssuesUpdateSchema,
  envVars: ['GITHUB_TOKEN'],
  version: '1.0.1',
  annotations: {
    title: 'Update Github Issue',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubIssuesUpdateTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesUpdateToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesUpdateSchema, args);

    return this.cleanResponse(await this.getClient().rest.issues.update(apiParams));
  }
}
