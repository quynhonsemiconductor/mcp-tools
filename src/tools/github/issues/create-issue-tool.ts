import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Create Github Issue tool parameters
 */
export const GithubIssuesCreateSchema = createGithubBaseSchema({
  title: z.string().min(1).describe('Issue title'),
  body: z.string().optional().describe('Issue body content'),
  assignees: z.array(z.string()).optional().describe('Usernames to assign to this issue'),
  labels: z.array(z.string()).optional().describe('Labels to apply to this issue'),
});

/**
 * Type for the Create Github Issue tool parameters
 */
export type GithubIssuesCreateToolParams = z.infer<typeof GithubIssuesCreateSchema>;

/**
 * Create Github Issue - Creates a new issue in a GitHub repository
 */
@Tool({
  id: 'github-issues-create',
  name: 'createGithubIssue',
  description: 'Creates a new issue in a GitHub repository',
  category: 'Github: Issues',
  parameters: GithubIssuesCreateSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'Create Github Issue',
    readOnlyHint: false,
    openWorldHint: true,
  },
})
export class GithubIssuesCreateTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesCreateToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesCreateSchema, args);

    return this.cleanResponse(await this.getClient().rest.issues.create(apiParams));
  }
}
