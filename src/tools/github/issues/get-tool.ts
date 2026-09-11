import { z } from 'zod';
import { CatchErrors } from '../../../utils/tools';
import { Tool } from '../../registry';
import { GithubBaseTool } from '../base-tool';
import { createGithubBaseSchema, parseAndTransformGitHubParams } from '../schemas';

/**
 * Schema definition for the Get Github Issue tool parameters
 */
export const GithubIssuesGetSchema = createGithubBaseSchema({
  issue_number: z.number().int().min(1).describe('The issue number'),
});

/**
 * Type for the Get Github Issue tool parameters
 */
export type GithubIssuesGetToolParams = z.infer<typeof GithubIssuesGetSchema>;

/**
 * Get Github Issue - Gets the contents of an issue within a repository
 */
@Tool({
  id: 'github-issues-get',
  name: 'getGithubIssue',
  description: 'Gets the contents of an issue within a repository',
  category: 'Github: Issues',
  parameters: GithubIssuesGetSchema,
  envVars: ['GITHUB_TOKEN'],
  includeByDefault: true,
  version: '1.0.1',
  annotations: {
    title: 'Get Github Issue',
    readOnlyHint: true,
    openWorldHint: true,
  },
})
export class GithubIssuesGetTool extends GithubBaseTool {
  @CatchErrors()
  async execute(args: GithubIssuesGetToolParams): Promise<string> {
    const apiParams = parseAndTransformGitHubParams(GithubIssuesGetSchema, args);

    return this.cleanResponse(await this.getClient().rest.issues.get(apiParams));
  }
}
